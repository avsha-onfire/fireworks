import { describe, expect, it } from 'vitest';
import { BRAND, pageTitle, providerDisplayName } from './brand';

describe('brand', () => {
  it('builds page titles from the product name', () => {
    expect(pageTitle()).toBe(`${BRAND.name} - ${BRAND.tagline}`);
    expect(pageTitle('Start a blank app')).toBe(`Start a blank app | ${BRAND.name}`);
  });

  it('keeps the word the e2e composer selectors match on', () => {
    expect(BRAND.composerPlaceholder).toContain('help');
  });

  it('points bug reports and the repo link at the same repository', () => {
    expect(BRAND.repoUrl).toBe(`https://github.com/${BRAND.repoSlug}`);
    expect(BRAND.bugReportUrl.startsWith(`${BRAND.repoUrl}/`)).toBe(true);
  });

  it('disambiguates the model provider that shares the product name', () => {
    expect(providerDisplayName(BRAND.name)).toBe(`${BRAND.name} AI (model provider)`);
    expect(providerDisplayName('OpenRouter')).toBe('OpenRouter');
  });

  it('uses a file slug that is safe in download names', () => {
    expect(BRAND.fileSlug).toMatch(/^[a-z0-9-]+$/);
  });
});
