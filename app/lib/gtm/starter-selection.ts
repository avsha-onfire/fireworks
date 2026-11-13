import { stripDataFileSummaries } from './data-file-block';
import { cleanPromptText } from './sanitize';
import { BRAND } from '~/lib/brand';

/*
 * Helpers for picking the starter project, naming the chat from the first
 * message, and introducing the starter's files in the chat.
 *
 * The starter picker matches framework names with plain word patterns. Sales
 * and marketing prose is full of words that collide with them ("a solid
 * pipeline", "trade expo", "content remix", "call script"), and an attached
 * data file can mention any technology in its column values. Everything here
 * works on the user's own words and leaves the picker's patterns alone.
 */

/** Starter for app requests that name no framework: its table, chart and form components suit data apps. */
export const DEFAULT_STARTER_TEMPLATE = 'Vite Shadcn';

const PREAMBLE_TEXT = 'is initializing your project with the required files using the';

/**
 * The line that introduces the starter's files in the chat, directly above
 * their `imported-files` artifact. The server recognises the starter import by
 * this line, so the wording must stay in step with `isStarterPreamble`.
 */
export function starterPreamble(templateName: string): string {
  return `${BRAND.name} ${PREAMBLE_TEXT} ${templateName} template.`;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Chats saved before the rename carry the upstream product name in the same line. */
const STARTER_PREAMBLE_LINE = new RegExp(
  `^(?:${escapeRegExp(BRAND.name)}|Bolt) ${escapeRegExp(PREAMBLE_TEXT)} [^\\n]{1,100} template\\.$`,
);

/** True when the line is the starter's preamble, under the current or the upstream product name. */
export function isStarterPreamble(line: string): boolean {
  return STARTER_PREAMBLE_LINE.test(line);
}

const UNTITLED_PROJECT = 'Untitled Project';
const MAX_TITLE_LENGTH = 100;

/** Shortest title worth keeping when a long first sentence is cut back to a whole word. */
const MIN_WORD_BREAK = 40;

/** "solid" as an adjective. SolidJS spellings (solidjs, solid.js, solid-js, Solid Start) are left alone. */
const SOLID_WORD = /\bsolid\b(?![.-]?js\b|[\s-]+start\b)/gi;

const EXPO_WORD = /\bexpo\b/gi;

/** Signs that "expo" means the mobile framework rather than a trade show. */
const EXPO_FRAMEWORK_CONTEXT =
  /\bexpo[\s-]+(?:apps?|go|router|sdk)\b|\breact[\s-]native\b|\bmobile\s+apps?\b|\b(?:ios|android)\b/i;

const REMIX_WORD = /\bremix\b/gi;

/** Signs that "remix" means the web framework rather than reworking content. */
const REMIX_FRAMEWORK_CONTEXT = /\bremix[\s-]+(?:apps?|run|framework|routes?|project)\b|\bremix\.run\b/i;

/**
 * A capitalised framework name used as one: right after "in", "using",
 * "with", "via" or "on" ("a todo app with Solid"), or as the kind of project
 * ("a Remix site"). Case matters: "on solid numbers" stays an adjective, and a
 * following capitalised word marks an event name ("with Expo West leads").
 */
function namedFramework(name: string): RegExp {
  return new RegExp(
    `\\b(?:in|using|with|via|on)\\s+${name}\\b(?![\\s-]+\\p{Lu})|\\b(?:an?|my|our)\\s+${name}\\s+(?:apps?|sites?|websites?|blogs?|projects?)\\b`,
    'u',
  );
}

const NAMED_SOLID = namedFramework('Solid');
const NAMED_EXPO = namedFramework('Expo');
const NAMED_REMIX = namedFramework('Remix');

/** Words the picker reads as a throwaway task that needs no project. */
const SIMPLE_TASK_WORD = /\b(?:script|snippet|one[- ]off|quick calculation|simple command)\b/gi;

/** Nouns that name an app. */
const APP_NOUN =
  '(?:apps?|tools?|dashboards?|trackers?|builders?|calculators?|planners?|librar(?:y|ies)|portals?|boards?|scorecards?|simulators?|analy[sz]ers?|workspaces?|hubs?)';

/** A word inside a noun phrase: anything but the words that start a clause or a prepositional phrase. */
const PHRASE_WORD = `(?!(?:that|which|who|to|for|with|from|of|in|on|at|by|using|and|or|but)\\b)[\\w'’-]+\\s+`;

/**
 * Signs that the message asks for an app, whatever else it mentions: an app
 * noun heads the object of a build verb ("build a cold call script library",
 * "create a tracker for one-off approvals"), or a script or snippet word
 * qualifies one ("call script library"). An app noun elsewhere ("a script to
 * rename files using a CLI tool") does not count.
 */
const APP_REQUEST = new RegExp(
  `\\b(?:build|create|make|design|develop|need|want)\\s+(?:(?:me|us)\\s+)?(?:an?|the|our|my)\\s+(?:${PHRASE_WORD}){0,4}${APP_NOUN}\\b` +
    `|\\b(?:scripts?|snippets?)\\s+(?:${PHRASE_WORD}){0,2}${APP_NOUN}\\b`,
  'i',
);

/**
 * The text the starter picker should match against: the user's own words,
 * without attached data-file summaries, and with everyday words that double
 * as framework names or "simple task" markers blanked out unless the message
 * clearly uses them in the technical sense.
 */
export function normalizeStarterMessage(message: string): string {
  let text = stripDataFileSummaries(message);

  if (!NAMED_SOLID.test(text)) {
    text = text.replace(SOLID_WORD, ' ');
  }

  if (!EXPO_FRAMEWORK_CONTEXT.test(text) && !NAMED_EXPO.test(text)) {
    text = text.replace(EXPO_WORD, ' ');
  }

  if (!REMIX_FRAMEWORK_CONTEXT.test(text) && !NAMED_REMIX.test(text)) {
    text = text.replace(REMIX_WORD, ' ');
  }

  if (APP_REQUEST.test(text)) {
    text = text.replace(SIMPLE_TASK_WORD, ' ');
  }

  return text.replace(/[ \t]{2,}/g, ' ').trim();
}

/** Characters that would break the title attribute of the project artifact or render as markup. */
const UNSAFE_TITLE_CHARACTER = /["<>`]/g;

const SENTENCE_END = /[.!?](?=\s|$)/g;

/** Abbreviations whose full stop does not end a sentence. */
const ABBREVIATIONS = new Set(['vs', 'etc', 'approx', 'incl', 'inc', 'ltd', 'corp', 'dept']);

/*
 * Abbreviations that count only when capitalised and written as a word of
 * their own: "Mr. Smith", "Acme Co.", "St. Louis", "No. 5", but not "200 ms."
 * or "due the 1st."
 */
const CAPITALISED_ABBREVIATION = /^[^\p{L}\p{N}]*(?:Mr|Mrs|Ms|Dr|Jr|Sr|Co|St|No)$/u;

/** A dotted initialism up to its last full stop: "e.g", "i.e", "U.S". */
const INITIALISM = /^(?:\p{L}\.)+\p{L}$/u;

const TRAILING_PUNCTUATION = /[\s.,;:]+$/;

function firstSentence(line: string): string {
  for (const match of line.matchAll(SENTENCE_END)) {
    const before = line.slice(0, match.index);

    // A list marker such as "1." is not a sentence.
    if (!/\p{L}{2}/u.test(before)) {
      continue;
    }

    const rawWord = before.slice(before.lastIndexOf(' ') + 1);
    const lastWord = rawWord.replace(/^[^\p{L}]+/u, '');

    if (
      match[0] === '.' &&
      (ABBREVIATIONS.has(lastWord.toLowerCase()) || CAPITALISED_ABBREVIATION.test(rawWord) || INITIALISM.test(lastWord))
    ) {
      continue;
    }

    return line.slice(0, match.index + 1);
  }

  return line;
}

/** Cuts the text to the title limit, at a word boundary when one is near, without splitting a surrogate pair. */
function clampTitle(text: string): string {
  if (text.length <= MAX_TITLE_LENGTH) {
    return text;
  }

  let clipped = '';

  for (const char of text) {
    if (clipped.length + char.length > MAX_TITLE_LENGTH) {
      break;
    }

    clipped += char;
  }

  // Drop a word the limit cut in half, unless that would leave too little of the title.
  const cutsWord = /\S/.test(text.charAt(clipped.length));
  const lastSpace = clipped.lastIndexOf(' ');
  const kept = cutsWord && lastSpace >= MIN_WORD_BREAK ? clipped.slice(0, lastSpace) : clipped;

  return kept.replace(TRAILING_PUNCTUATION, '');
}

/**
 * A chat title from the first sentence (or line) of the user's own words. It
 * is at most 100 characters, a single line, and free of double quotes, angle
 * brackets and backticks, because it is placed in the title attribute of the
 * project artifact. Text from attached data files never reaches the title.
 */
export function deriveChatTitle(message: string): string {
  const firstLine =
    stripDataFileSummaries(message)
      .split('\n')
      .find((line) => line.trim() !== '') ?? '';

  // Cleaning also bounds the work: a pasted wall of text is cut long before the sentence scan.
  const cleaned = cleanPromptText(firstLine.replace(UNSAFE_TITLE_CHARACTER, ''), MAX_TITLE_LENGTH * 4);
  const title = clampTitle(firstSentence(cleaned).replace(TRAILING_PUNCTUATION, ''));

  return title || UNTITLED_PROJECT;
}
