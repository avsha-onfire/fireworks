import { toast } from 'react-toastify';
import { describe, expect, it, vi } from 'vitest';
import { handleDataFile, MAX_DATA_FILE_READ_BYTES } from './data-file-attach';
import { extractDataFileSummaries, stripDataFileSummaries } from './data-file-block';
import { describeDataFile } from './data-preview';
import type { ComposerInputSetter } from './types';

vi.mock('react-toastify', () => ({
  toast: { info: vi.fn(), success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

const DEALS_CSV = 'Stage,Amount,Close Date\nOpen,1200,2026-11-30\nWon,800,2026-10-12\n';

const addedMessage = (file: string) =>
  `Added a summary of ${file} to your message. The file itself was not uploaded. The summary has column names, types and a few example values such as stages, amounts and dates; names, e-mail addresses, phone numbers, links and free text are left out. Check it before you send: everything in the message goes to your AI provider.`;

/** A stand-in for the composer state: applies updates the way React's state setter does. */
function createComposer(initial = '') {
  let value = initial;

  const setInput = vi.fn<ComposerInputSetter>((next) => {
    value = typeof next === 'function' ? next(value) : next;
  });

  return { setInput, read: () => value };
}

function dataFile(content: string | Uint8Array<ArrayBuffer>, name: string, type = 'text/csv'): File {
  return new File([content], name, { type });
}

const settled = (mock: unknown) => vi.waitFor(() => expect(mock).toHaveBeenCalled());

describe('handleDataFile', () => {
  it('leaves images and other files to the caller', () => {
    const composer = createComposer();

    expect(handleDataFile(dataFile('not really a png', 'screenshot.png', 'image/png'), composer.setInput)).toBe(false);
    expect(handleDataFile(dataFile('hello', 'notes.txt', 'text/plain'), composer.setInput)).toBe(false);
    expect(composer.setInput).not.toHaveBeenCalled();
    expect(toast.info).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('explains that Excel workbooks cannot be read and consumes the file', () => {
    const composer = createComposer();

    const workbook = dataFile(
      'PK',
      'pipeline.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );

    expect(handleDataFile(workbook, composer.setInput)).toBe(true);
    expect(toast.warning).toHaveBeenCalledExactlyOnceWith(
      "Excel files can't be read here. Export the sheet as CSV and attach that.",
    );
    expect(composer.setInput).not.toHaveBeenCalled();
  });

  it('adds a summary of a CSV file to an empty composer and tells the user what it holds', async () => {
    const composer = createComposer();

    expect(handleDataFile(dataFile(DEALS_CSV, 'deals.csv'), composer.setInput)).toBe(true);
    await settled(toast.info);

    expect(composer.read()).toBe(describeDataFile('deals.csv', DEALS_CSV));
    expect(composer.setInput).toHaveBeenCalledExactlyOnceWith(expect.any(Function));
    expect(toast.info).toHaveBeenCalledExactlyOnceWith(addedMessage('deals.csv'), { autoClose: 15000 });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('appends the summary after what the user typed, separated by a blank line', async () => {
    const composer = createComposer('Build a pipeline review dashboard.\n');

    handleDataFile(dataFile(DEALS_CSV, 'deals.csv'), composer.setInput);
    await settled(toast.info);

    expect(composer.read()).toBe(`Build a pipeline review dashboard.\n\n${describeDataFile('deals.csv', DEALS_CSV)}`);
    expect(stripDataFileSummaries(composer.read())).toBe('Build a pipeline review dashboard.');
  });

  it('keeps every summary when several files arrive together', async () => {
    const composer = createComposer('Build a quota attainment tracker.');
    const quotas = 'Quarter,Quota\nQ1-2027,250000\nQ2-2027,275000\n';

    handleDataFile(dataFile(DEALS_CSV, 'deals.csv'), composer.setInput);
    handleDataFile(dataFile(quotas, 'quotas.csv'), composer.setInput);
    await vi.waitFor(() => expect(toast.info).toHaveBeenCalledTimes(2));

    const summaries = extractDataFileSummaries(composer.read());

    expect(summaries).toHaveLength(2);
    expect(summaries).toContain(describeDataFile('deals.csv', DEALS_CSV));
    expect(summaries).toContain(describeDataFile('quotas.csv', quotas));
    expect(composer.read().startsWith('Build a quota attainment tracker.\n\n')).toBe(true);
  });

  it('accepts JSON files and CSV files that the system reports as Excel documents', async () => {
    const composer = createComposer();
    const json = JSON.stringify([{ stage: 'Open', amount: 1200 }]);

    expect(handleDataFile(dataFile(json, 'deals.json', 'application/json'), composer.setInput)).toBe(true);
    expect(handleDataFile(dataFile(DEALS_CSV, 'report.csv', 'application/vnd.ms-excel'), composer.setInput)).toBe(true);
    await vi.waitFor(() => expect(toast.info).toHaveBeenCalledTimes(2));

    expect(composer.read()).toContain(describeDataFile('deals.json', json));
    expect(composer.read()).toContain(describeDataFile('report.csv', DEALS_CSV));
  });

  it('reads only the first 512 KB of a large file and estimates the rest', async () => {
    const composer = createComposer();
    const file = dataFile(`Stage,Amount\n${'Open,100\n'.repeat(100000)}Secret Stage,1\n`, 'big.csv');
    const slice = vi.spyOn(file, 'slice');

    handleDataFile(file, composer.setInput);
    await settled(toast.info);

    expect(MAX_DATA_FILE_READ_BYTES).toBe(512 * 1024);
    expect(slice).toHaveBeenCalledExactlyOnceWith(0, MAX_DATA_FILE_READ_BYTES);
    expect(composer.read()).toContain('Rows: about 100,000 (estimated from the first 512 KB of a 879 KB file; ');
    expect(composer.read()).not.toContain('Secret');
  });

  it('does not mistake a character cut in half by the size limit for another encoding', async () => {
    const composer = createComposer();
    const header = 'Société,Montant\n';
    const padding = MAX_DATA_FILE_READ_BYTES - 1 - new TextEncoder().encode(header).length;
    const file = dataFile(`${header}${'a'.repeat(padding)}é,5\n${'Lyon,1\n'.repeat(50)}`, 'ventes.csv');

    handleDataFile(file, composer.setInput);
    await settled(toast.info);

    expect(composer.read()).toContain('- Société — ');
    expect(composer.read()).not.toContain('Decoded as');
  });

  it('falls back to Windows-1252 when the file is not UTF-8', async () => {
    const composer = createComposer();
    const text = 'Société;Montant\nNantes;1,5\nLyon;2,5\n';
    const bytes = Uint8Array.from(text, (character) => character.charCodeAt(0));

    handleDataFile(dataFile(bytes, 'ventes.csv'), composer.setInput);
    await settled(toast.info);

    expect(composer.read()).toBe(describeDataFile('ventes.csv', text, { encoding: 'Windows-1252' }));
    expect(composer.read()).toContain('Format: semicolon-separated values. Decoded as Windows-1252.');
    expect(composer.read()).toContain('- Société — ');
  });

  it.each([
    ['little-endian', (code: number) => [code & 0xff, code >> 8], [0xff, 0xfe]],
    ['big-endian', (code: number) => [code >> 8, code & 0xff], [0xfe, 0xff]],
  ])('reads %s UTF-16 exports', async (_label, encode, byteOrderMark) => {
    const composer = createComposer();
    const text = 'Kampagne\tKosten\nFrühling\t100\nHerbst\t250\n';

    const bytes = Uint8Array.from([
      ...byteOrderMark,
      ...Array.from(text).flatMap((character) => encode(character.charCodeAt(0))),
    ]);

    handleDataFile(dataFile(bytes, 'ads.csv'), composer.setInput);
    await settled(toast.info);

    expect(composer.read()).toBe(describeDataFile('ads.csv', text, { encoding: 'UTF-16' }));
    expect(composer.read()).toContain('Format: tab-separated values. Decoded as UTF-16.');
  });

  it('reports an error and consumes the file when the composer cannot be updated', () => {
    expect(handleDataFile(dataFile(DEALS_CSV, 'deals.csv'), undefined)).toBe(true);
    expect(toast.error).toHaveBeenCalledExactlyOnceWith(
      "Couldn't add deals.csv to your message because the chat is still loading. Try again.",
    );
    expect(toast.info).not.toHaveBeenCalled();
  });

  it.each([
    ['an empty file', '', 'deals.csv'],
    ['invalid JSON', '{"deals": [', 'deals.json'],
    ['JSON without records', '{"stage": "Open"}', 'deals.json'],
  ])('adds nothing for %s and says so', async (_label, content, name) => {
    const composer = createComposer('Build a pipeline review dashboard.');

    expect(handleDataFile(dataFile(content, name), composer.setInput)).toBe(true);
    await settled(toast.error);

    expect(toast.error).toHaveBeenCalledExactlyOnceWith(
      `Couldn't read ${name} as a table, so nothing was added to your message.`,
    );
    expect(composer.setInput).not.toHaveBeenCalled();
    expect(toast.info).not.toHaveBeenCalled();
  });

  it('adds nothing when the file cannot be read from disk', async () => {
    const composer = createComposer();
    const file = dataFile(DEALS_CSV, 'deals.csv');

    vi.spyOn(file, 'slice').mockReturnValue({ arrayBuffer: () => Promise.reject(new Error('gone')) } as Blob);

    expect(handleDataFile(file, composer.setInput)).toBe(true);
    await settled(toast.error);

    expect(toast.error).toHaveBeenCalledExactlyOnceWith(
      "Couldn't read deals.csv, so nothing was added to your message.",
    );
    expect(composer.setInput).not.toHaveBeenCalled();
  });

  it('cleans the file name before showing it', async () => {
    const composer = createComposer();

    handleDataFile(dataFile(DEALS_CSV, 'q4 <deals> `dana@northwind.example`.csv'), composer.setInput);
    await settled(toast.info);

    expect(toast.info).toHaveBeenCalledExactlyOnceWith(addedMessage('q4 ‹deals› [email]'), { autoClose: 15000 });
    expect(composer.read()).not.toContain('dana@');
  });

  it('keeps contact details out of the composer', async () => {
    const composer = createComposer();

    const contacts = [
      'First Name,Last Name,Email,Phone Number,Lifecycle Stage',
      'Maria,Koval,maria.koval@northwind.example,+1 (415) 555-0134,Lead',
      'Jordan,Lee,jordan.lee@initech.example,(212) 555-0188,Customer',
      '',
    ].join('\n');

    handleDataFile(dataFile(contacts, 'contacts.csv'), composer.setInput);
    await settled(toast.info);

    for (const value of ['Maria', 'Koval', 'Jordan', 'Lee', 'northwind', 'initech', '0134', '0188', 'Customer']) {
      expect(composer.read()).not.toContain(value);
    }
  });

  it('keeps rep and account names out under headers it does not recognise, as the notice promises', async () => {
    const composer = createComposer();
    const reps = ['Priya Raman', 'Marcus Oyelaran', 'Dana Whitfield'];
    const accounts = ['Northwind Traders', 'Initech Holdings'];

    const rows = Array.from({ length: 30 }, (_, index) =>
      [
        reps[index % 3],
        reps[(index + 1) % 3],
        `${reps[index % 3]} - West`,
        accounts[index % 2],
        ['Discovery', 'Proposal'][index % 2],
        String(1000 + index),
      ].join(','),
    );

    handleDataFile(
      dataFile(['Closer,Setter,Territory,Org,Stage,Amount', ...rows].join('\n'), 'deals.csv'),
      composer.setInput,
    );
    await settled(toast.info);

    expect(toast.info).toHaveBeenCalledExactlyOnceWith(addedMessage('deals.csv'), { autoClose: 15000 });
    expect(composer.read()).toContain('- Stage — category — 100% filled — 2 distinct — values: Discovery | Proposal');

    for (const value of [...reps, ...accounts].flatMap((name) => name.split(' '))) {
      expect(composer.read()).not.toContain(value);
    }
  });
});
