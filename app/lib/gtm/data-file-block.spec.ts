import { describe, expect, it } from 'vitest';
import {
  DATA_FILE_BLOCK_END,
  DATA_FILE_BLOCK_START,
  extractDataFileSummaries,
  hasDataFileSummary,
  stripDataFileSummaries,
  wrapDataFileSummary,
} from './data-file-block';

describe('data-file summary blocks', () => {
  const summary = wrapDataFileSummary('File: opportunities.csv\nColumns: Stage, Amount, Tech Stack (React, Vue)');

  it('wraps a summary in a fenced block', () => {
    expect(summary.startsWith(`${DATA_FILE_BLOCK_START}\n`)).toBe(true);
    expect(summary.endsWith(`\n${DATA_FILE_BLOCK_END}`)).toBe(true);
  });

  it('detects and extracts summaries', () => {
    const text = `Build a pipeline dashboard.\n\n${summary}\n\nUse dark mode.\n\n${summary}`;

    expect(hasDataFileSummary(text)).toBe(true);
    expect(hasDataFileSummary('Build a pipeline dashboard.')).toBe(false);
    expect(extractDataFileSummaries(text)).toEqual([summary, summary]);
  });

  it('strips summaries and keeps what the user wrote', () => {
    expect(stripDataFileSummaries(`Build a pipeline dashboard.\n\n${summary}\n\nUse dark mode.`)).toBe(
      'Build a pipeline dashboard.\n\nUse dark mode.',
    );
    expect(stripDataFileSummaries(summary)).toBe('');
    expect(stripDataFileSummaries('No files here.')).toBe('No files here.');
  });

  it('strips an unterminated summary to the end of the text', () => {
    expect(stripDataFileSummaries(`Build it.\n\n${DATA_FILE_BLOCK_START}\nFile: x.csv\nColumns: React`)).toBe(
      'Build it.',
    );
  });
});
