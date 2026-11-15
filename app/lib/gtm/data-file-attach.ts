import { toast } from 'react-toastify';
import { dataFileLabel, inspectDataFile, isDataFile, isSpreadsheetFile } from './data-preview';
import type { ComposerInputSetter } from './types';

/** Only the beginning of a large file is read: enough rows to describe its shape. */
export const MAX_DATA_FILE_READ_BYTES = 512 * 1024;

/** The notice asks the user to check the summary, so it stays up longer than a routine toast. */
const NOTICE_DURATION_MS = 15000;

const SPREADSHEET_MESSAGE = "Excel files can't be read here. Export the sheet as CSV and attach that.";

function summaryAddedMessage(file: string): string {
  return `Added a summary of ${file} to your message. The file itself was not uploaded. The summary has column names, types and a few example values such as stages, amounts and dates; names, e-mail addresses, phone numbers, links and free text are left out. Check it before you send: everything in the message goes to your AI provider.`;
}

interface DecodedText {
  text: string;

  /** Set when the bytes were not UTF-8. */
  encoding?: string;
}

function decodeText(bytes: Uint8Array, truncated: boolean): DecodedText {
  // Spreadsheet and ad-platform "Unicode" exports are UTF-16 and start with a byte-order mark.
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: new TextDecoder('utf-16le').decode(bytes), encoding: 'UTF-16' };
  }

  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: new TextDecoder('utf-16be').decode(bytes), encoding: 'UTF-16' };
  }

  try {
    /*
     * A partial read can stop in the middle of a multi-byte character. In
     * streaming mode the decoder holds those bytes back instead of treating
     * them as invalid.
     */
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes, { stream: truncated }) };
  } catch {
    // Not UTF-8: spreadsheet applications on Windows save CSV files in the Western European code page.
    return { text: new TextDecoder('windows-1252').decode(bytes), encoding: 'Windows-1252' };
  }
}

async function addDataFileSummary(file: File, setInput: ComposerInputSetter): Promise<void> {
  const label = dataFileLabel(file.name);

  try {
    const truncated = file.size > MAX_DATA_FILE_READ_BYTES;
    const bytes = new Uint8Array(await file.slice(0, MAX_DATA_FILE_READ_BYTES).arrayBuffer());
    const { text, encoding } = decodeText(bytes, truncated);
    const { summary, readable } = inspectDataFile(file.name, text, { truncated, totalBytes: file.size, encoding });

    if (!readable) {
      toast.error(`Couldn't read ${label} as a table, so nothing was added to your message.`);
      return;
    }

    // An updater, so summaries of several files dropped together all land in the message.
    setInput((previous) => (previous.trim() ? `${previous.trimEnd()}\n\n${summary}` : summary));
    toast.info(summaryAddedMessage(label), { autoClose: NOTICE_DURATION_MS });
  } catch {
    toast.error(`Couldn't read ${label}, so nothing was added to your message.`);
  }
}

/**
 * Handles a file the user attached, dropped or pasted. For a data file (CSV,
 * TSV, JSON) a summary of its shape is appended to the composer; the file
 * itself stays in the browser. Returns true when the file was dealt with here
 * and false when the caller should carry on with its own handling (images).
 *
 * The file is read in the background, so the summary and the notice appear
 * shortly after this function returns.
 */
export function handleDataFile(file: File, setInput: ComposerInputSetter | undefined): boolean {
  if (isSpreadsheetFile(file)) {
    toast.warning(SPREADSHEET_MESSAGE);
    return true;
  }

  if (!isDataFile(file)) {
    return false;
  }

  if (!setInput) {
    toast.error(
      `Couldn't add ${dataFileLabel(file.name)} to your message because the chat is still loading. Try again.`,
    );
    return true;
  }

  void addDataFileSummary(file, setInput);

  return true;
}
