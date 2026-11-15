/*
 * Text hygiene for anything that ends up inside a prompt: workspace settings,
 * data-file summaries, connector field values.
 */

/** Matches invisible format characters (zero-width, bidi overrides, tag characters). */
const FORMAT_CHARACTER = /\p{Cf}/u;

/**
 * Normalises untrusted text so it is safe to show in a form and to place in a
 * prompt:
 *
 * - control characters, line breaks and tabs become spaces;
 * - invisible format characters are removed, so a value cannot carry text the
 *   user does not see;
 * - angle brackets are swapped for look-alikes, so a value can never open or
 *   close a prompt section;
 * - runs of whitespace collapse and the result is clamped to `maxLength`
 *   characters without splitting a surrogate pair.
 *
 * Anything that is not a string yields an empty string. Never throws.
 */
export function cleanPromptText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string' || maxLength <= 0) {
    return '';
  }

  // Bound the work before looking at individual characters: inputs can be megabytes long.
  const bounded = value.slice(0, maxLength * 4 + 16);

  let text = '';

  for (const char of bounded) {
    const code = char.codePointAt(0) ?? 0;

    if (code < 32 || (code >= 127 && code <= 159)) {
      text += ' ';
    } else if (FORMAT_CHARACTER.test(char)) {
      continue;
    } else if (char === '<') {
      text += '‹';
    } else if (char === '>') {
      text += '›';
    } else {
      text += char;
    }
  }

  // Array.from splits on code points, so the clamp cannot cut a surrogate pair in half.
  return Array.from(text.replace(/\s+/g, ' ').trim()).slice(0, maxLength).join('').trim();
}
