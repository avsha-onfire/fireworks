/**
 * Central product identity.
 *
 * Every user-visible mention of the product comes from here, so the fork can be
 * renamed in one place. Keep this module dependency-free: client components,
 * server routes and tests all import it.
 *
 * Internal identifiers (CSS tokens, storage keys, protocol tags, package and
 * image names) deliberately keep their upstream `bolt` spelling so the fork
 * stays mergeable with bolt.diy.
 */
export const BRAND = {
  /** Product name shown in titles, the header and copy. */
  name: 'Fireworks',

  /** How the assistant refers to itself in system prompts and chat copy. */
  assistantName: 'Fireworks',
  tagline: 'The AI app builder for go-to-market teams',
  description:
    'Describe the sales, marketing, RevOps or customer-success tool you need and Fireworks builds a working app for it.',

  /** Landing page copy. */
  headline: 'Build the tools your revenue team is waiting for',
  subheadline:
    'Describe a pipeline dashboard, commission calculator or renewal tracker in plain English, or attach a CRM export, and get a working app in minutes.',

  /** Composer placeholder in build mode. Keep the word "help": the e2e selectors match on it. */
  composerPlaceholder:
    'What should Fireworks help you build? For example: a pipeline review board from my Salesforce export',

  /** The fork's own repository. Bug reports and desktop updates point here, not at upstream. */
  repoSlug: 'avsha-onfire/fireworks',
  repoUrl: 'https://github.com/avsha-onfire/fireworks',
  bugReportUrl: 'https://github.com/avsha-onfire/fireworks/issues/new',

  /** The in-app manual still documents the underlying open-source builder. */
  docsUrl: 'https://stackblitz-labs.github.io/bolt.diy/',
  docsTitle: 'Builder documentation (bolt.diy)',

  /** Upstream attribution. */
  upstreamName: 'bolt.diy',
  upstreamUrl: 'https://github.com/stackblitz-labs/bolt.diy',

  /** Prefix for exported and downloaded files, for example `fireworks-settings.json`. */
  fileSlug: 'fireworks',
} as const;

export type Brand = typeof BRAND;

/**
 * Display name for a model provider. One provider (Fireworks AI) shares the
 * product's name, so it gets a suffix wherever the two could be confused. The
 * provider's id is never changed.
 */
export function providerDisplayName(providerName: string): string {
  return providerName === BRAND.name ? `${providerName} AI (model provider)` : providerName;
}

/** Document title: `Section | Fireworks`, or the product title when no section is given. */
export function pageTitle(section?: string): string {
  return section ? `${section} | ${BRAND.name}` : `${BRAND.name} - ${BRAND.tagline}`;
}
