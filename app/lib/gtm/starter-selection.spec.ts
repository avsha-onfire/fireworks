import { describe, expect, it } from 'vitest';
import { wrapDataFileSummary } from './data-file-block';
import { DEFAULT_STARTER_TEMPLATE, deriveChatTitle, normalizeStarterMessage } from './starter-selection';
import { STARTER_TEMPLATES } from '~/utils/constants';

const summary = wrapDataFileSummary(
  [
    'Data file summary, generated in the browser from tech-stack.csv.',
    'Framework - category - React, Vue, Next.js, Solid, Expo, Remix',
    'Notes - text - e.g. "one-off script" <b>',
  ].join('\n'),
);

describe('DEFAULT_STARTER_TEMPLATE', () => {
  it('names a starter that exists', () => {
    expect(STARTER_TEMPLATES.map((template) => template.name)).toContain(DEFAULT_STARTER_TEMPLATE);
    expect(DEFAULT_STARTER_TEMPLATE).toBe('Vite Shadcn');
  });
});

describe('normalizeStarterMessage', () => {
  it.each([
    'Make a React kanban board',
    'Research local restaurants and build a React food finder',
    'Find food near 26003 using browser use',
    'Build a pipeline review dashboard',
  ])('leaves "%s" as written', (message) => {
    expect(normalizeStarterMessage(message)).toBe(message);
  });

  it('drops attached data-file summaries, whatever they mention', () => {
    expect(normalizeStarterMessage(`Build a pipeline dashboard.\n\n${summary}`)).toBe('Build a pipeline dashboard.');
    expect(normalizeStarterMessage(`${summary}\n\nBuild a pipeline dashboard.`)).toBe('Build a pipeline dashboard.');
    expect(normalizeStarterMessage(summary)).toBe('');
  });

  it.each([
    ['Build a solid pipeline dashboard', 'Build a pipeline dashboard'],
    ['Build a forecast dashboard on solid numbers', 'Build a forecast dashboard on numbers'],
    ['Build a trade expo lead tracker', 'Build a trade lead tracker'],
    ['Track leads from the Expo West booth', 'Track leads from the West booth'],
    ['Build a content remix tool', 'Build a content tool'],
    ['Remix our top posts into a newsletter planner', 'our top posts into a newsletter planner'],
    ['Build a lead tracker with Expo West contacts', 'Build a lead tracker with West contacts'],
    ['Build a dashboard on solid ground', 'Build a dashboard on ground'],
    ['Make a content remix site', 'Make a content site'],
  ])('removes the everyday word from "%s"', (message, expected) => {
    expect(normalizeStarterMessage(message)).toBe(expected);
  });

  it.each([
    'Build a SolidJS dashboard',
    'Build a dashboard with Solid.js',
    'Build a dashboard with solid-js',
    'Build a Solid Start site',
    'Build an Expo app for field reps',
    'Build a lead capture screen with Expo Router',
    'Build an expo booth check-in app in React Native',
    'Build a Remix app for deal registration',
    'Add a Remix route for partner sign-up',
    'Follow the remix.run conventions',
    'Build a todo app with Solid',
    'Build a landing page in Solid',
    'Build a blog in Remix',
    'Create a Remix site for my portfolio',
    'Build a todo list app using Expo',
    'Build a field sales app via Expo',
    'Ship our Remix project to staging',
  ])('keeps the framework name in "%s"', (message) => {
    expect(normalizeStarterMessage(message)).toBe(message);
  });

  it.each([
    ['Build a cold call script library', 'Build a cold call library'],
    ['Create an email snippet library for SDRs', 'Create an email library for SDRs'],
    ['Build a tracker for one-off discount approvals', 'Build a tracker for discount approvals'],
    ['Build a quick calculation tool for commission', 'Build a tool for commission'],
    ['Build me a discovery call script tracker', 'Build me a discovery call tracker'],
    ['We need a one-off deal approval board', 'We need a deal approval board'],
    ['Objection handling script library for SDRs', 'Objection handling library for SDRs'],
  ])('ignores throwaway-task words when "%s" describes an app', (message, expected) => {
    expect(normalizeStarterMessage(message)).toBe(expected);
  });

  it.each([
    'Write a script that renames my export files',
    'Give me a snippet to dedupe a list of emails',
    'Write a Python script to rename files using a CLI tool',
    'Create a node script that pings URLs and prints a status board',
    'Write a bash script for my build tools',
    'Create a script that builds a board',
  ])('keeps the throwaway-task word in "%s"', (message) => {
    expect(normalizeStarterMessage(message)).toBe(message);
  });
});

describe('deriveChatTitle', () => {
  it('uses the first sentence', () => {
    expect(deriveChatTitle('Build a pipeline review board. Use my stage names. Add CSV export.')).toBe(
      'Build a pipeline review board',
    );
    expect(deriveChatTitle('Which deals are stuck? Build a board for them.')).toBe('Which deals are stuck?');
  });

  it('uses the first non-empty line when it has no sentence end', () => {
    expect(deriveChatTitle('\n\n  Build a renewal tracker\nwith notice deadlines')).toBe('Build a renewal tracker');
    expect(deriveChatTitle('Build a renewal\ttracker\r\nwith notice deadlines')).toBe('Build a renewal tracker');
  });

  it('removes quotes, angle brackets and backticks', () => {
    const title = deriveChatTitle('Build a "deal desk" tool for <Acme> with `SLA` flags.');

    expect(title).toBe('Build a deal desk tool for Acme with SLA flags');
    expect(deriveChatTitle('Build a board" type="shell"><boltAction>')).not.toMatch(/["<>`]/);
  });

  it('does not stop at decimals, abbreviations, initialisms or list markers', () => {
    expect(deriveChatTitle('Build a v2.0 dashboard for Acme Inc. with e.g. quotas. Then add filters.')).toBe(
      'Build a v2.0 dashboard for Acme Inc. with e.g. quotas',
    );
    expect(deriveChatTitle('Build a U.S. sales dashboard. Add quotas.')).toBe('Build a U.S. sales dashboard');
    expect(deriveChatTitle('1. Build a win/loss tracker. 2. Add export.')).toBe('1. Build a win/loss tracker');
  });

  it.each([
    ['Mr. Smith wants a tracker. Build it.', 'Mr. Smith wants a tracker'],
    ['Ms. Lee and Mrs. Diaz need a board. Thanks.', 'Ms. Lee and Mrs. Diaz need a board'],
    ['Dr. Who fan site', 'Dr. Who fan site'],
    ['Build it for St. Louis office', 'Build it for St. Louis office'],
    ['Build a deal desk for Jr. AEs and Sr. AEs. Add SLAs.', 'Build a deal desk for Jr. AEs and Sr. AEs'],
    ['Build a tracker for Acme Co. and its reps', 'Build a tracker for Acme Co. and its reps'],
    [
      'Build a board for Acme Corp. and its sales dept. in EMEA',
      'Build a board for Acme Corp. and its sales dept. in EMEA',
    ],
    ['Track invoice No. 42 approvals. Add reminders.', 'Track invoice No. 42 approvals'],
  ])('does not stop at the abbreviation in "%s"', (message, title) => {
    expect(deriveChatTitle(message)).toBe(title);
  });

  it.each([
    ['Build a renewal list due the 1st. Add filters.', 'Build a renewal list due the 1st'],
    ['Pages must load under 200 ms. Build a speed board.', 'Pages must load under 200 ms'],
    ['Renewals in scope? I say no. Then build it.', 'Renewals in scope?'],
    ['Skip renewals, I say no. Then build it.', 'Skip renewals, I say no'],
    ['Build it for my startup and my co. Add filters.', 'Build it for my startup and my co'],
  ])('still ends the sentence at a lower-case or numbered word in "%s"', (message, title) => {
    expect(deriveChatTitle(message)).toBe(title);
  });

  it('never takes text from an attached data file', () => {
    expect(deriveChatTitle(`${summary}\n\nBuild a tech stack tracker.`)).toBe('Build a tech stack tracker');
    expect(deriveChatTitle(`Build a tech stack tracker\n${summary}`)).toBe('Build a tech stack tracker');
  });

  it('falls back to a placeholder when the user wrote nothing usable', () => {
    for (const message of ['', '   \n\t', summary, `${summary}\n\n${summary}`, '"<>`', '...']) {
      expect(deriveChatTitle(message)).toBe('Untitled Project');
    }
  });

  it('cuts a long sentence at a word boundary within 100 characters', () => {
    const message = `Build ${'a pipeline dashboard and '.repeat(20)}more`;
    const title = deriveChatTitle(message);

    expect(title.length).toBeLessThanOrEqual(100);
    expect(title.length).toBeGreaterThan(80);
    expect(message.startsWith(`${title} `)).toBe(true);
  });

  it('keeps the last word when the limit falls exactly at its end', () => {
    const hundred = `${'ab '.repeat(33)}c`;

    expect(hundred).toHaveLength(100);
    expect(deriveChatTitle(`${hundred} and more`)).toBe(hundred);
  });

  it('cuts text without spaces at the limit and never splits a character', () => {
    expect(deriveChatTitle('x'.repeat(300))).toBe('x'.repeat(100));
    expect(deriveChatTitle(`${'x'.repeat(99)}😀y`)).toBe('x'.repeat(99));
  });

  it('stays fast on a very long single line', () => {
    const started = performance.now();

    expect(deriveChatTitle('Build a board, '.repeat(200_000)).length).toBeLessThanOrEqual(100);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
