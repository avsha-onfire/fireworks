import { describe, expect, it } from 'vitest';
import { DEFAULT_GTM_EXAMPLE_PROMPTS, getExamplePrompts } from './example-prompts';
import { DEFAULT_STARTER_TEMPLATE } from './starter-selection';
import { GTM_ROLE_IDS, type GtmRoleId } from './types';
import { BRAND } from '~/lib/brand';
import { selectStarterTemplate } from '~/utils/selectStarterTemplate';

const lists: [string, string[]][] = [
  ['no role', getExamplePrompts('')],
  ...GTM_ROLE_IDS.map((role): [string, string[]] => [role, getExamplePrompts(role)]),
];

const everyPrompt = [...new Set(lists.flatMap(([, prompts]) => prompts))];

describe('getExamplePrompts', () => {
  it('returns the seven default prompts when no role is set', () => {
    expect(DEFAULT_GTM_EXAMPLE_PROMPTS).toHaveLength(7);
    expect(getExamplePrompts('')).toEqual(DEFAULT_GTM_EXAMPLE_PROMPTS);
  });

  it('falls back to the defaults for a value that is not a role', () => {
    for (const value of ['astronaut', '__proto__', 'constructor', 'toString']) {
      expect(getExamplePrompts(value as GtmRoleId)).toEqual(DEFAULT_GTM_EXAMPLE_PROMPTS);
    }
  });

  it.each(GTM_ROLE_IDS)('returns six to eight prompts of its own for %s', (role) => {
    const prompts = getExamplePrompts(role);

    expect(prompts.length).toBeGreaterThanOrEqual(6);
    expect(prompts.length).toBeLessThanOrEqual(8);
    expect(prompts).not.toEqual(DEFAULT_GTM_EXAMPLE_PROMPTS);

    for (const otherRole of GTM_ROLE_IDS.filter((other) => other !== role)) {
      expect(prompts).not.toEqual(getExamplePrompts(otherRole));
    }

    // At least half are not in the default list: choosing a role visibly changes the chips.
    const ownPrompts = prompts.filter((prompt) => !DEFAULT_GTM_EXAMPLE_PROMPTS.includes(prompt));

    expect(ownPrompts.length).toBeGreaterThanOrEqual(prompts.length / 2);
  });

  it.each(lists)('lists unique prompts for %s', (_label, prompts) => {
    // The chips are keyed by their text.
    expect(new Set(prompts).size).toBe(prompts.length);
  });
});

describe('GTM example prompts', () => {
  it.each(everyPrompt)('"%s" is a short imperative request', (prompt) => {
    expect(prompt).toMatch(/^(?:Build|Create|Make) (?:a|an) \S/);
    expect(prompt.length).toBeLessThanOrEqual(60);
    expect(prompt.length).toBeGreaterThanOrEqual(30);
    expect(prompt).toBe(prompt.trim());
    expect(prompt).not.toMatch(/[.!?"'`<>\n]| {2,}/);
    expect(prompt.toLowerCase()).not.toContain(BRAND.name.toLowerCase());
  });

  it.each(everyPrompt)('"%s" gets the default starter and is its own chat title', async (prompt) => {
    const { template, title } = await selectStarterTemplate({ message: prompt });

    // An information request or a framework false friend would pick another starter.
    expect(template).toBe(DEFAULT_STARTER_TEMPLATE);
    expect(title).toBe(prompt);
  });
});
