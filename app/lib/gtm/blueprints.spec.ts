import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { GTM_BLUEPRINTS, GTM_BLUEPRINT_CATEGORIES, getBlueprintsForRole } from './blueprints';
import { getGtmInstructions } from './prompt';
import { DEFAULT_STARTER_TEMPLATE } from './starter-selection';
import { GTM_BLUEPRINT_CATEGORY_IDS, GTM_ROLE_IDS, type GtmBlueprint, type GtmRoleId } from './types';
import { GTM_ROLES } from './workspace';
import { BRAND } from '~/lib/brand';
import { selectStarterTemplate } from '~/utils/selectStarterTemplate';

const CLOSING_SENTENCE = 'Start with sample data and let me import my own CSV later.';

/** The icon set the `i-ph:*` classes are generated from. */
const phosphor = JSON.parse(
  readFileSync(createRequire(import.meta.url).resolve('@iconify-json/ph/icons.json'), 'utf8'),
) as { icons: Record<string, unknown>; aliases?: Record<string, unknown> };

function iconExists(iconClass: string): boolean {
  const name = iconClass.replace(/^i-ph:/, '');

  return iconClass.startsWith('i-ph:') && (name in phosphor.icons || name in (phosphor.aliases ?? {}));
}

const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;
const firstLine = (blueprint: GtmBlueprint) => blueprint.prompt.split('\n')[0];
const ids = (blueprints: GtmBlueprint[]) => blueprints.map((blueprint) => blueprint.id);

/** The definition that follows `<metric> =` in a prompt, up to the next metric. */
function definitionOf(metric: string, prompt: string): string | undefined {
  const start = prompt.indexOf(`${metric} = `);

  return start === -1 ? undefined : prompt.slice(start + metric.length + 3).split(/;|\.\s|\.$/)[0];
}

const blueprintCases = GTM_BLUEPRINTS.map((blueprint) => [blueprint.id, blueprint] as const);

function blueprintById(id: string): GtmBlueprint {
  const found = GTM_BLUEPRINTS.find((blueprint) => blueprint.id === id);

  if (!found) {
    throw new Error(`No blueprint ${id}`);
  }

  return found;
}

describe('GTM blueprint categories', () => {
  it('list every category once, in the declared order, with an existing icon', () => {
    expect(GTM_BLUEPRINT_CATEGORIES.map((category) => category.id)).toEqual([...GTM_BLUEPRINT_CATEGORY_IDS]);

    for (const category of GTM_BLUEPRINT_CATEGORIES) {
      expect(category.label).not.toBe('');
      expect(iconExists(category.icon), category.icon).toBe(true);
    }
  });
});

describe('GTM blueprint catalog', () => {
  it('holds 18 to 22 blueprints with unique ids and titles', () => {
    expect(GTM_BLUEPRINTS.length).toBeGreaterThanOrEqual(18);
    expect(GTM_BLUEPRINTS.length).toBeLessThanOrEqual(22);
    expect(new Set(ids(GTM_BLUEPRINTS)).size).toBe(GTM_BLUEPRINTS.length);
    expect(new Set(GTM_BLUEPRINTS.map((blueprint) => blueprint.title)).size).toBe(GTM_BLUEPRINTS.length);
  });

  it('has at least three blueprints in every category and for every role', () => {
    for (const category of GTM_BLUEPRINT_CATEGORY_IDS) {
      const count = GTM_BLUEPRINTS.filter((blueprint) => blueprint.category === category).length;

      expect(count, category).toBeGreaterThanOrEqual(3);
    }

    for (const role of GTM_ROLE_IDS) {
      const count = GTM_BLUEPRINTS.filter((blueprint) => blueprint.roles.includes(role)).length;

      expect(count, role).toBeGreaterThanOrEqual(3);
    }
  });

  it('has exactly one forecast blueprint', () => {
    expect(ids(GTM_BLUEPRINTS).filter((id) => id.includes('forecast'))).toEqual(['forecast-rollup']);
  });

  it.each(blueprintCases)('%s has well-formed card fields', (_id, blueprint) => {
    expect(blueprint.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

    expect(wordCount(blueprint.title)).toBeGreaterThanOrEqual(2);
    expect(wordCount(blueprint.title)).toBeLessThanOrEqual(5);

    expect(blueprint.summary.length).toBeGreaterThan(30);
    expect(blueprint.summary.length).toBeLessThanOrEqual(110);
    expect(blueprint.summary).toMatch(/\.$/);

    // Shown after "Works with: ", so it reads as the rest of that sentence.
    expect(blueprint.dataInputs.length).toBeGreaterThan(20);
    expect(blueprint.dataInputs.length).toBeLessThanOrEqual(140);
    expect(blueprint.dataInputs).toMatch(/^[a-z]/);
    expect(blueprint.dataInputs).not.toMatch(/\.$/);

    expect(GTM_BLUEPRINT_CATEGORY_IDS).toContain(blueprint.category);
    expect(iconExists(blueprint.icon), blueprint.icon).toBe(true);

    expect(blueprint.roles.length).toBeGreaterThan(0);
    expect(new Set(blueprint.roles).size).toBe(blueprint.roles.length);

    for (const role of blueprint.roles) {
      expect(GTM_ROLE_IDS).toContain(role);
    }

    expect(blueprint.tags.length).toBeGreaterThan(0);
    expect(new Set(blueprint.tags).size).toBe(blueprint.tags.length);
  });
});

describe('GTM blueprint prompts', () => {
  it.each(blueprintCases)('%s opens with a short imperative sentence on its own line', (_id, blueprint) => {
    const opening = firstLine(blueprint);

    expect(opening).toMatch(/^Build (?:a|an) [^.!?]+\.$/);
    expect(opening.length).toBeLessThanOrEqual(100);
    expect(opening).not.toMatch(/["'`<>‘’“”]/);
    expect(blueprint.prompt.startsWith(`${opening}\n\n`)).toBe(true);
  });

  it.each(blueprintCases)(
    '%s is 120 to 230 words and ends by asking for sample data and CSV import',
    (_id, blueprint) => {
      expect(wordCount(blueprint.prompt)).toBeGreaterThanOrEqual(120);
      expect(wordCount(blueprint.prompt)).toBeLessThanOrEqual(230);
      expect(blueprint.prompt.endsWith(` ${CLOSING_SENTENCE}`)).toBe(true);
      expect(blueprint.prompt.split(CLOSING_SENTENCE)).toHaveLength(2);
    },
  );

  it.each(blueprintCases)('%s describes its data, views, metrics and sample data', (_id, blueprint) => {
    const paragraphs = blueprint.prompt.split('\n\n');

    for (const label of ['Data: ', 'Views: (1) ', 'Metrics: ', 'Sample data: ']) {
      expect(
        paragraphs.filter((paragraph) => paragraph.startsWith(label)),
        label,
      ).toHaveLength(1);
    }

    // A first version stays small: three views, numbered in order.
    expect(blueprint.prompt).toContain('; (2) ');
    expect(blueprint.prompt).toContain('; (3) ');
    expect(blueprint.prompt).not.toContain('(4)');
  });

  it.each(blueprintCases)('%s is plain text a GTM operator can edit', (_id, blueprint) => {
    // Nothing that would break the chat title, read as markup or start a code block.
    expect(blueprint.prompt).not.toMatch(/["`<>“”\t]/);
    expect(blueprint.prompt).not.toMatch(/ {2,}| \n|\n /);
    expect(blueprint.prompt.split('\n\n').filter((paragraph) => paragraph.includes('\n'))).toEqual([]);

    // The tool, never the technology or the builder's own name.
    expect(blueprint.prompt).not.toMatch(
      /\b(?:react|vue|angular|svelte|next\.?js|vite|shadcn|tailwind|typescript|javascript|node\.?js|supabase|recharts|localstorage|html|css|json|api|database|frontend|backend)\b/i,
    );
    expect(blueprint.prompt.toLowerCase()).not.toContain(BRAND.name.toLowerCase());
    expect(blueprint.prompt).not.toMatch(/\bbolt\b/i);
  });

  it('defines shared metrics one way across the catalog', () => {
    const expected: Record<string, string> = {
      'pipeline coverage': 'open pipeline closing this quarter / remaining quota (quota minus closed won)',
      'weighted pipeline': 'sum of amount × stage probability over open deals',
      'win rate by count': 'won / (won + lost) for deals closed in the period, open deals excluded',
      'sales velocity': 'qualified opportunities × win rate × average won deal size / average sales cycle days',
      NRR: '(starting ARR + expansion - contraction - churn) / starting ARR',
      GRR: '(starting ARR - contraction - churn) / starting ARR, never above 100%',
      'magic number': 'net new ARR in the quarter / prior-quarter S&M spend',
    };

    for (const [metric, definition] of Object.entries(expected)) {
      const definitions = GTM_BLUEPRINTS.map((blueprint) => definitionOf(metric, blueprint.prompt)).filter(
        (found) => found !== undefined,
      );

      expect(definitions.length, metric).toBeGreaterThan(0);

      for (const found of definitions) {
        expect(found?.startsWith(definition), `${metric}: ${found}`).toBe(true);
      }
    }
  });

  it('never divides win rate by all opportunities or coverage by the full quota', () => {
    for (const blueprint of GTM_BLUEPRINTS) {
      expect(blueprint.prompt).not.toMatch(/win rate(?: by count)? = won \/ (?!\(won \+ lost\))/);
      expect(blueprint.prompt).not.toMatch(/coverage = [^;.]*\/ quota\b/);
    }
  });

  it('shows Quota met wherever coverage is measured against remaining quota', () => {
    const withCoverage = GTM_BLUEPRINTS.filter((blueprint) => blueprint.prompt.includes('pipeline coverage = '));

    expect(withCoverage.length).toBeGreaterThanOrEqual(2);

    for (const blueprint of withCoverage) {
      expect(blueprint.prompt).toContain('showing Quota met when nothing remains');
    }
  });

  it('never annualises an ARR delta in the magic number', () => {
    for (const blueprint of GTM_BLUEPRINTS) {
      expect(definitionOf('magic number', blueprint.prompt) ?? '').not.toMatch(/[×x*]\s*4/);
    }
  });

  it("words sales velocity exactly as the builder's own reference does", () => {
    const reference = getGtmInstructions({ chatMode: 'build' }).toLowerCase();
    const velocity = GTM_BLUEPRINTS.map((blueprint) => definitionOf('sales velocity', blueprint.prompt)).find(Boolean);

    expect(reference).toContain(`sales velocity = ${velocity}`);
  });

  it('measures retention on customers active at the start of a trailing 12-month window', () => {
    const withRetention = GTM_BLUEPRINTS.filter((blueprint) => blueprint.prompt.includes('NRR = '));

    expect(withRetention.length).toBeGreaterThanOrEqual(2);

    for (const blueprint of withRetention) {
      expect(blueprint.prompt).toMatch(/trailing 12 months, only (?:on|for) customers active at the start/);
    }
  });

  it('treats stages, probabilities and forecast categories as editable settings', () => {
    const withWeightedPipeline = GTM_BLUEPRINTS.filter((blueprint) =>
      blueprint.prompt.includes('weighted pipeline = '),
    );

    expect(withWeightedPipeline.length).toBeGreaterThanOrEqual(2);

    for (const blueprint of withWeightedPipeline) {
      expect(blueprint.prompt).toContain('Stage names and win probabilities are editable settings.');
    }

    const forecast = GTM_BLUEPRINTS.find((blueprint) => blueprint.id === 'forecast-rollup');

    expect(forecast?.prompt).toContain('an editable list, separate from stage');
  });

  it('never pins a fiscal quarter as the current one, so sample data follows today', () => {
    for (const blueprint of GTM_BLUEPRINTS) {
      expect(blueprint.prompt, blueprint.id).not.toMatch(
        /\b(?:currently|now)\b[^.;]*\b(?:first|second|third|fourth|Q[1-4])\b|\b(?:first|second|third|fourth) fiscal quarter\b/i,
      );
    }

    expect(blueprintById('marketing-budget-pacing').prompt).toContain(
      'with invoices up to today in the current fiscal quarter',
    );
  });

  it('defines sourced pipeline by first touch before creation, as the reference does', () => {
    const reference = getGtmInstructions({ chatMode: 'build' });
    const withSourced = GTM_BLUEPRINTS.filter((blueprint) => blueprint.prompt.includes('sourced pipeline = '));

    expect(reference).toContain('sourced pipeline = opportunities whose first touch before creation is ');
    expect(ids(withSourced)).toContain('campaign-attribution');

    for (const blueprint of withSourced) {
      expect(definitionOf('sourced pipeline', blueprint.prompt), blueprint.id).toMatch(
        /^opportunities whose first touch before creation is the campaign \(may differ from the CRM lead source\)$/,
      );
    }
  });

  it('counts a skipped stage as passed wherever conversion is measured on cohorts', () => {
    const funnel = blueprintById('funnel-velocity-analyzer').prompt;

    expect(funnel).toContain('the share that reached the next or any later step (a skipped step counts as passed)');
    expect(funnel).not.toContain('the share that ever reached the next step');
  });
});

describe('GTM blueprint data models', () => {
  it('links leads to the opportunities they became in the funnel analyzer', () => {
    const funnel = blueprintById('funnel-velocity-analyzer');

    expect(funnel.prompt).toContain('leads (lead ID, ');
    expect(funnel.prompt).toContain('converted opportunity ID)');
    expect(funnel.prompt).toContain('opportunities (opportunity ID, ');
    expect(funnel.dataInputs).toContain('a lead export with MQL and SQL dates and converted opportunity ID');
    expect(funnel.dataInputs).toContain('an opportunity export with ID, ');
  });

  it('measures event attendance on past events and bounds event-sourced pipeline in time', () => {
    const event = blueprintById('event-lead-follow-up').prompt;

    expect(event).toContain('attendance rate = attended / (attended + no-show) for past events, booth scans excluded');
    expect(event).not.toContain('attended / registered');
    expect(event).toContain(
      'An opportunity is event-sourced when created within 90 days after the event from an attendee or booth scan with no open opportunity before it',
    );
  });

  it('asks the pipeline review for stage entry dates and hides flags an import cannot support', () => {
    const review = blueprintById('pipeline-review-board');

    expect(review.prompt).toContain('stage entry date');
    expect(review.prompt).toContain('push count');
    expect(review.prompt).toContain('Hide a flag, saying why, when an import lacks its column.');
    expect(review.dataInputs).toContain('stage entry date');
    expect(review.dataInputs).toContain('push count');
  });

  it('seeds past quarters for forecast accuracy and keeps the formula bounded', () => {
    const forecast = blueprintById('forecast-rollup').prompt;

    expect(definitionOf('forecast accuracy', forecast)).toBe(
      "1 - |manager's week-3 call - final closed won| / max(final closed won, call), floored at 0",
    );
    expect(forecast).toContain("each rep's week-3 call and final closed won for the last 4 quarters");
    expect(forecast).toContain('Pipeline, Best Case, Commit, Closed and Omitted (excluded from roll-ups)');
  });

  it('gives the renewal tracker the history that trailing retention needs', () => {
    const renewals = blueprintById('renewal-expansion-tracker').prompt;

    expect(renewals).toContain('customers (name, segment, owner, start date)');
    expect(renewals).toContain('contracts with 12 months of history');
    expect(renewals).toContain('outcome of renewed, downgraded or churned');
    expect(renewals).toContain('only closed-won expansion counts toward NRR');
    expect(renewals).toContain('12 months of past renewals, downgrades, churns and closed-won expansions');
  });

  it('defines the account total score on two scores of the same scale', () => {
    const prioritizer = blueprintById('target-account-prioritizer').prompt;

    expect(prioritizer).toContain('both scaled to 0-100');
    expect(definitionOf('total score', prioritizer)).toBe('fit weight × fit + intent weight × intent (default 60/40)');
    expect(prioritizer).toContain('buying-committee role mapped from title');
  });
});

describe('starting a chat from a blueprint', () => {
  it.each(blueprintCases)(
    '%s gets the default starter and its opening sentence as the title',
    async (_id, blueprint) => {
      const { template, title } = await selectStarterTemplate({ message: blueprint.prompt });

      // An information request or a framework false friend would pick another starter.
      expect(template).toBe(DEFAULT_STARTER_TEMPLATE);
      expect(title).toBe(firstLine(blueprint).replace(/\.$/, ''));
      expect(title.length).toBeLessThanOrEqual(100);
      expect(title).not.toMatch(/["<>`\n]/);
    },
  );
});

describe('getBlueprintsForRole', () => {
  const isRelevant = (blueprint: GtmBlueprint, role: GtmRoleId) =>
    blueprint.roles.includes(role) ||
    (GTM_ROLES.find((entry) => entry.id === role)?.blueprintCategories ?? []).includes(blueprint.category);

  it('returns the catalog order when no role is set', () => {
    expect(getBlueprintsForRole('')).toEqual(GTM_BLUEPRINTS);
    expect(getBlueprintsForRole('astronaut' as GtmRoleId)).toEqual(GTM_BLUEPRINTS);
  });

  it('leads with one broadly useful blueprint per category when no role is set', () => {
    const firstSix = getBlueprintsForRole('').slice(0, 6);

    expect(ids(firstSix)).toEqual([
      'pipeline-review-board',
      'forecast-rollup',
      'campaign-attribution',
      'target-account-prioritizer',
      'customer-health-scorecard',
      'commission-calculator',
    ]);
    expect(new Set(firstSix.map((blueprint) => blueprint.category)).size).toBe(GTM_BLUEPRINT_CATEGORY_IDS.length);
  });

  it('returns a new array each time, so callers cannot reorder the catalog', () => {
    const catalogOrder = ids(GTM_BLUEPRINTS);

    getBlueprintsForRole('').reverse();
    getBlueprintsForRole('sales').reverse();

    expect(ids(GTM_BLUEPRINTS)).toEqual(catalogOrder);
  });

  it.each(GTM_ROLE_IDS)('puts the blueprints relevant to %s first and keeps every blueprint', (role) => {
    const ordered = getBlueprintsForRole(role);
    const roleCategories = GTM_ROLES.find((entry) => entry.id === role)?.blueprintCategories ?? [];

    expect([...ids(ordered)].sort()).toEqual([...ids(GTM_BLUEPRINTS)].sort());

    // The first card is made for the role, from the role's leading category.
    expect(ordered[0].roles).toContain(role);
    expect(ordered[0].category).toBe(roleCategories[0]);

    // No blueprint of the role's own may sit behind one that is unrelated to it.
    const relevance = ordered.map((blueprint) => isRelevant(blueprint, role));
    const firstUnrelated = relevance.indexOf(false);

    expect(firstUnrelated).toBeGreaterThanOrEqual(3);
    expect(relevance.slice(firstUnrelated)).not.toContain(true);

    // Those written for the role come before those that only share its categories.
    const curated = ordered.map((blueprint) => blueprint.roles.includes(role));

    expect(curated.slice(curated.indexOf(false))).not.toContain(true);
  });

  it('keeps catalog order within a group', () => {
    const marketing = getBlueprintsForRole('marketing');
    const marketingCategory = GTM_BLUEPRINTS.filter((blueprint) => blueprint.category === 'marketing');

    expect(ids(marketing.slice(0, marketingCategory.length))).toEqual(ids(marketingCategory));
  });
});
