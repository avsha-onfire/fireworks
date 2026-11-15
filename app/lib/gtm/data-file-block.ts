/*
 * Delimiters of a data-file summary inside a chat message.
 *
 * When the user attaches a CSV, TSV or JSON file, the composer receives a
 * summary of its shape wrapped in a fenced block with this info string. The
 * fence keeps the summary visually separate in the chat, and lets other code
 * (starter selection, chat titles, the prompt cache) tell the user's own words
 * from file-derived text.
 */

export const DATA_FILE_BLOCK_LANGUAGE = 'data-file-summary';
export const DATA_FILE_BLOCK_START = `\`\`\`${DATA_FILE_BLOCK_LANGUAGE}`;
export const DATA_FILE_BLOCK_END = '```';

const DATA_FILE_BLOCK = new RegExp(`${DATA_FILE_BLOCK_START}[^\\n]*\\n[\\s\\S]*?(?:\\n${DATA_FILE_BLOCK_END}|$)`, 'g');

/** Wraps summary lines in the data-file fence. The body must not contain backticks. */
export function wrapDataFileSummary(body: string): string {
  return `${DATA_FILE_BLOCK_START}\n${body.trim()}\n${DATA_FILE_BLOCK_END}`;
}

/** True when the text contains at least one data-file summary. */
export function hasDataFileSummary(text: string): boolean {
  return text.includes(DATA_FILE_BLOCK_START);
}

/** The data-file summaries found in the text, in order. */
export function extractDataFileSummaries(text: string): string[] {
  return text.match(DATA_FILE_BLOCK) ?? [];
}

/** The text with every data-file summary removed: what the user actually wrote. */
export function stripDataFileSummaries(text: string): string {
  return text
    .replace(DATA_FILE_BLOCK, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
