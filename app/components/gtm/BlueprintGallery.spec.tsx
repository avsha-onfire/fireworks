import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { BLUEPRINT_PREVIEW_COUNT, BlueprintGallery, selectBlueprintCards } from './BlueprintGallery';
import type * as BlueprintCatalog from '~/lib/gtm/blueprints';
import type { GtmBlueprint, GtmBlueprintCategoryId, GtmRoleId } from '~/lib/gtm/types';

function makeBlueprint(id: string, category: GtmBlueprintCategoryId): GtmBlueprint {
  return {
    id,
    title: `Title of ${id}`,
    category,
    summary: `Summary of ${id}`,
    dataInputs: `the export for ${id}`,
    icon: 'i-ph:funnel',
    roles: ['sales'],
    tags: [],
    prompt: `Build the ${id} app.`,
  };
}

const CATALOG: GtmBlueprint[] = [
  makeBlueprint('pipeline-review', 'sales'),
  makeBlueprint('forecast', 'sales'),
  makeBlueprint('call-prep', 'prospecting'),
  makeBlueprint('attribution', 'marketing'),
  makeBlueprint('budget-pacing', 'marketing'),
  makeBlueprint('commission', 'revops'),
  makeBlueprint('health-scorecard', 'customer-success'),
  makeBlueprint('qbr-builder', 'customer-success'),
];

vi.mock('~/lib/gtm/blueprints', async (importOriginal) => ({
  ...(await importOriginal<typeof BlueprintCatalog>()),
  getBlueprintsForRole: (role: GtmRoleId | '') =>
    role === 'cs' ? [makeBlueprint('for-cs', 'customer-success')] : [makeBlueprint('for-everyone', 'sales')],
}));

function renderedCardIds(markup: string): string[] {
  return [...markup.matchAll(/data-blueprint-id="([^"]+)"/g)].map((match) => match[1]);
}

describe('BlueprintGallery', () => {
  it('shows the heading, the prefill hint and the first six cards', () => {
    const markup = renderToStaticMarkup(<BlueprintGallery blueprints={CATALOG} />);

    expect(markup).toContain('id="blueprints"');
    expect(markup).toContain('Start from a blueprint');
    expect(markup).toContain('Pick one to prefill the message box. Edit anything, attach your CSV export, then send.');
    expect(renderedCardIds(markup)).toEqual(CATALOG.slice(0, BLUEPRINT_PREVIEW_COUNT).map(({ id }) => id));
    expect(BLUEPRINT_PREVIEW_COUNT).toBe(6);
  });

  it('describes each card with its title, summary, category and the data it works with', () => {
    const markup = renderToStaticMarkup(
      <BlueprintGallery blueprints={[makeBlueprint('qbr-builder', 'customer-success')]} />,
    );

    const card = markup.slice(markup.indexOf('data-blueprint-id="qbr-builder"'));

    expect(card).toContain('Title of qbr-builder');
    expect(card).toContain('Summary of qbr-builder');
    expect(card).toContain('Customer Success');
    expect(card).toContain('Works with: the export for qbr-builder');
    expect(card).toContain('i-ph:funnel');
  });

  it('offers the rest of the catalog behind a toggle only when cards are hidden', () => {
    const long = renderToStaticMarkup(<BlueprintGallery blueprints={CATALOG} />);
    const short = renderToStaticMarkup(<BlueprintGallery blueprints={CATALOG.slice(0, BLUEPRINT_PREVIEW_COUNT)} />);

    expect(long).toMatch(/<button[^>]*aria-expanded="false"[^>]*>Show all blueprints/);
    expect(short).not.toContain('Show all blueprints');
  });

  it('filters with pressed-state chips: All first, then only the categories that have blueprints', () => {
    const markup = renderToStaticMarkup(<BlueprintGallery blueprints={CATALOG} />);

    const chips = [
      ...markup.matchAll(/<button[^>]*aria-pressed="(true|false)"[^>]*>(?:<span[^>]*><\/span>)?([^<]+)</g),
    ];

    expect(chips.map((chip) => chip[2])).toEqual([
      'All',
      'Sales',
      'Prospecting',
      'Marketing',
      'RevOps',
      'Customer Success',
    ]);
    expect(chips.map((chip) => chip[1])).toEqual(['true', 'false', 'false', 'false', 'false', 'false']);
  });

  it('renders nothing when there are no blueprints', () => {
    expect(renderToStaticMarkup(<BlueprintGallery blueprints={[]} />)).toBe('');
  });

  it('uses the catalog ordered for the role when no list is passed', () => {
    expect(renderedCardIds(renderToStaticMarkup(<BlueprintGallery role="cs" />))).toEqual(['for-cs']);
    expect(renderedCardIds(renderToStaticMarkup(<BlueprintGallery />))).toEqual(['for-everyone']);
  });

  it('is built from plain buttons, without form controls that could precede the composer', () => {
    const markup = renderToStaticMarkup(<BlueprintGallery blueprints={CATALOG} />);
    const buttons = markup.match(/<button[^>]*>/g) ?? [];

    expect(buttons.length).toBeGreaterThan(BLUEPRINT_PREVIEW_COUNT);
    expect(buttons.every((button) => button.includes('type="button"'))).toBe(true);
    expect(markup).not.toMatch(/<textarea|<select|<input|role="combobox"/);
  });

  it('styles with theme tokens rather than fixed colours', () => {
    const markup = renderToStaticMarkup(<BlueprintGallery blueprints={CATALOG} />);

    expect(markup).toContain('bolt-elements-');
    expect(markup).not.toMatch(
      /#[0-9a-f]{3,8}\b|\b(?:bg|text|border|ring|outline)-(?:gray|purple|blue|white|black)\b/i,
    );
  });
});

describe('selectBlueprintCards', () => {
  it('previews six cards of the whole catalog and reports that more are available', () => {
    const { cards, canExpand } = selectBlueprintCards(CATALOG, 'all', false);

    expect(cards).toEqual(CATALOG.slice(0, 6));
    expect(canExpand).toBe(true);
  });

  it('returns every card once expanded', () => {
    expect(selectBlueprintCards(CATALOG, 'all', true).cards).toEqual(CATALOG);
  });

  it('keeps only the chosen category, in catalog order', () => {
    const { cards, canExpand } = selectBlueprintCards(CATALOG, 'marketing', false);

    expect(cards.map(({ id }) => id)).toEqual(['attribution', 'budget-pacing']);
    expect(canExpand).toBe(false);
  });

  it('returns no cards for a category without blueprints', () => {
    expect(selectBlueprintCards(CATALOG, 'leadership', true).cards).toEqual([]);
  });
});
