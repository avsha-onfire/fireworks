import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as BlueprintGalleryModule from './BlueprintGallery';
import {
  GtmHomeSections,
  type GtmHomeSectionsProps,
  resolveBlueprintInput,
  withDataFileSummaries,
} from './GtmHomeSections';
import type * as BlueprintCatalog from '~/lib/gtm/blueprints';
import { wrapDataFileSummary } from '~/lib/gtm/data-file-block';
import type { GtmBlueprint } from '~/lib/gtm/types';

const PIPELINE: GtmBlueprint = {
  id: 'pipeline-review',
  title: 'Pipeline Review Board',
  category: 'sales',
  summary: 'Spot stalled deals before the weekly review.',
  dataInputs: 'an opportunity export',
  icon: 'i-ph:kanban',
  roles: ['sales'],
  tags: [],
  prompt: 'Build a pipeline review board.\n\nStart with sample data and let me import my own CSV later.',
};

const FORECAST: GtmBlueprint = {
  ...PIPELINE,
  id: 'forecast',
  title: 'Forecast Roll-up',
  prompt: 'Build a forecast roll-up.\n\nStart with sample data and let me import my own CSV later.',
};

const mocks = vi.hoisted(() => ({
  examplePrompts: [] as string[],
  getExamplePrompts: vi.fn(),
  blueprints: [] as GtmBlueprint[],
  selectBlueprint: undefined as ((blueprint: GtmBlueprint) => void) | undefined,
}));

// The real gallery, with its selection callback captured: a card in static markup cannot be clicked.
vi.mock('./BlueprintGallery', async (importOriginal) => {
  const actual = await importOriginal<typeof BlueprintGalleryModule>();

  return {
    ...actual,
    BlueprintGallery: (props: BlueprintGalleryModule.BlueprintGalleryProps) => {
      mocks.selectBlueprint = props.onSelect;

      return <actual.BlueprintGallery {...props} />;
    },
  };
});

vi.mock('~/lib/gtm/example-prompts', () => ({ getExamplePrompts: mocks.getExamplePrompts }));

vi.mock('~/lib/gtm/blueprints', async (importOriginal) => ({
  ...(await importOriginal<typeof BlueprintCatalog>()),
  get GTM_BLUEPRINTS() {
    return mocks.blueprints;
  },
  getBlueprintsForRole: () => mocks.blueprints,
}));

const OPPORTUNITIES_SUMMARY = wrapDataFileSummary('Data file summary for opportunities.csv\nRows: 240');
const QUOTAS_SUMMARY = wrapDataFileSummary('Data file summary for quotas.csv\nRows: 12');

describe('GtmHomeSections', () => {
  beforeEach(() => {
    mocks.examplePrompts = ['Build a pipeline review dashboard', 'Create a commission calculator'];
    mocks.blueprints = [PIPELINE, FORECAST];
    mocks.getExamplePrompts.mockReset();
    mocks.getExamplePrompts.mockImplementation(() => mocks.examplePrompts);
  });

  it('renders without any props, as the server does for the landing page', () => {
    const markup = renderToStaticMarkup(<GtmHomeSections />);

    expect(markup).toContain('id="examples"');
    expect(markup).toContain('id="blueprints"');
    expect(markup).toContain('For developers');
  });

  it('keeps the examples container when there are no example prompts', () => {
    mocks.examplePrompts = [];

    const markup = renderToStaticMarkup(<GtmHomeSections />);

    expect(markup).toMatch(/<div id="examples"[^>]*><\/div>/);
  });

  it('renders the example prompts for no role on the first render, as buttons', () => {
    const markup = renderToStaticMarkup(<GtmHomeSections />);
    const examples = markup.slice(markup.indexOf('id="examples"'), markup.indexOf('id="blueprints"'));

    expect(mocks.getExamplePrompts).toHaveBeenCalledWith('');
    expect(examples.match(/<button type="button"/g)).toHaveLength(2);
    expect(examples).toContain('Build a pipeline review dashboard');
    expect(examples).toContain('Create a commission calculator');
  });

  it('orders the sections: examples, blueprints, then the developer starters', () => {
    const markup = renderToStaticMarkup(<GtmHomeSections />);

    const positions = ['id="examples"', 'id="blueprints"', 'For developers', 'Start a blank'].map((marker) =>
      markup.indexOf(marker),
    );

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(markup).toContain('href="/starter?template=');
  });

  it('adds no form control that could precede the composer in the page', () => {
    const markup = renderToStaticMarkup(<GtmHomeSections />);

    expect(markup).not.toMatch(/<textarea|<select|role="combobox"/);
  });
});

describe('choosing a blueprint', () => {
  const confirm = vi.fn<(message: string) => boolean>();

  function chooseBlueprint(blueprint: GtmBlueprint, props: GtmHomeSectionsProps = {}) {
    renderToStaticMarkup(<GtmHomeSections {...props} />);
    mocks.selectBlueprint?.(blueprint);
  }

  function fakeTextarea() {
    const textarea = { focus: vi.fn(), scrollIntoView: vi.fn(), scrollTop: 480 };

    return { textarea, textareaRef: { current: textarea as unknown as HTMLTextAreaElement } };
  }

  beforeEach(() => {
    mocks.blueprints = [PIPELINE, FORECAST];
    mocks.selectBlueprint = undefined;
    mocks.getExamplePrompts.mockReset();
    mocks.getExamplePrompts.mockReturnValue([]);
    confirm.mockReset();
    confirm.mockReturnValue(true);
    vi.stubGlobal('window', { confirm });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);

      return 0;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prefills the composer through the setter and does not send', () => {
    const setInput = vi.fn();
    const handleInputChange = vi.fn();
    const onSendPrompt = vi.fn();

    chooseBlueprint(FORECAST, { setInput, handleInputChange, onSendPrompt });

    expect(setInput).toHaveBeenCalledExactlyOnceWith(FORECAST.prompt);
    expect(handleInputChange).not.toHaveBeenCalled();
    expect(onSendPrompt).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });

  it('falls back to the composer change handler when there is no setter', () => {
    const handleInputChange = vi.fn();

    chooseBlueprint(FORECAST, { handleInputChange });

    expect(handleInputChange).toHaveBeenCalledExactlyOnceWith({ target: { value: FORECAST.prompt } });
  });

  it('keeps the summaries of files already attached to the message', () => {
    const setInput = vi.fn();

    chooseBlueprint(FORECAST, { input: OPPORTUNITIES_SUMMARY, setInput });

    expect(setInput).toHaveBeenCalledExactlyOnceWith(`${FORECAST.prompt}\n\n${OPPORTUNITIES_SUMMARY}`);
  });

  it('focuses the composer without jumping to the caret and shows the prompt from its first line', () => {
    const { textarea, textareaRef } = fakeTextarea();

    chooseBlueprint(FORECAST, { setInput: vi.fn(), textareaRef });

    expect(textarea.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    expect(textarea.scrollTop).toBe(0);
    expect(textarea.scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: 'center', behavior: 'smooth' });
  });

  it('leaves the composer untouched when the user keeps what they typed', () => {
    const setInput = vi.fn();
    const { textarea, textareaRef } = fakeTextarea();

    confirm.mockReturnValue(false);
    chooseBlueprint(FORECAST, { input: 'Build me a churn tracker', setInput, textareaRef });

    expect(confirm).toHaveBeenCalledOnce();
    expect(setInput).not.toHaveBeenCalled();
    expect(textarea.focus).not.toHaveBeenCalled();
    expect(textarea.scrollIntoView).not.toHaveBeenCalled();
    expect(textarea.scrollTop).toBe(480);
  });

  it('is harmless before the composer is wired up, as on the server-rendered page', () => {
    expect(() => chooseBlueprint(FORECAST)).not.toThrow();
    expect(mocks.selectBlueprint).toBeTypeOf('function');
  });
});

describe('withDataFileSummaries', () => {
  it('returns the prompt alone when no file is attached', () => {
    expect(withDataFileSummaries('  Build a dashboard  ', 'something I typed')).toBe('Build a dashboard');
  });

  it('appends every attached summary, in order, after the prompt', () => {
    const composer = `my notes\n\n${OPPORTUNITIES_SUMMARY}\n\n${QUOTAS_SUMMARY}`;

    expect(withDataFileSummaries('Build a dashboard', composer)).toBe(
      `Build a dashboard\n\n${OPPORTUNITIES_SUMMARY}\n\n${QUOTAS_SUMMARY}`,
    );
  });
});

describe('resolveBlueprintInput', () => {
  const catalog = [PIPELINE, FORECAST];

  it('fills an empty composer without asking', () => {
    const confirmReplace = vi.fn();

    expect(resolveBlueprintInput(PIPELINE, '', catalog, confirmReplace)).toBe(PIPELINE.prompt);
    expect(confirmReplace).not.toHaveBeenCalled();
  });

  it('keeps an attached data-file summary below the blueprint prompt without asking', () => {
    const confirmReplace = vi.fn();

    expect(resolveBlueprintInput(PIPELINE, OPPORTUNITIES_SUMMARY, catalog, confirmReplace)).toBe(
      `${PIPELINE.prompt}\n\n${OPPORTUNITIES_SUMMARY}`,
    );
    expect(confirmReplace).not.toHaveBeenCalled();
  });

  it('swaps one untouched blueprint prompt for another without asking and without duplicating summaries', () => {
    const confirmReplace = vi.fn();
    const composer = `${PIPELINE.prompt}\n\n${OPPORTUNITIES_SUMMARY}\n`;

    expect(resolveBlueprintInput(FORECAST, composer, catalog, confirmReplace)).toBe(
      `${FORECAST.prompt}\n\n${OPPORTUNITIES_SUMMARY}`,
    );
    expect(confirmReplace).not.toHaveBeenCalled();
  });

  it('asks before replacing text the user typed, and replaces it once they agree', () => {
    const confirmReplace = vi.fn(() => true);

    expect(resolveBlueprintInput(FORECAST, 'Build me a churn tracker', catalog, confirmReplace)).toBe(FORECAST.prompt);
    expect(confirmReplace).toHaveBeenCalledExactlyOnceWith(
      'Replace your message with the "Forecast Roll-up" blueprint?',
    );
  });

  it('asks before replacing a blueprint prompt the user has edited', () => {
    const confirmReplace = vi.fn(() => true);

    resolveBlueprintInput(FORECAST, `${PIPELINE.prompt} Use EUR.`, catalog, confirmReplace);

    expect(confirmReplace).toHaveBeenCalledOnce();
  });

  it('leaves the composer alone when the user declines', () => {
    expect(resolveBlueprintInput(FORECAST, 'Build me a churn tracker', catalog, () => false)).toBeUndefined();
  });

  it('tells the user that attached summaries survive the replacement', () => {
    const confirmReplace = vi.fn(() => true);
    const composer = `Build me a churn tracker\n\n${OPPORTUNITIES_SUMMARY}`;

    expect(resolveBlueprintInput(FORECAST, composer, catalog, confirmReplace)).toBe(
      `${FORECAST.prompt}\n\n${OPPORTUNITIES_SUMMARY}`,
    );
    expect(confirmReplace).toHaveBeenCalledExactlyOnceWith(
      'Replace your message with the "Forecast Roll-up" blueprint? The attached file summaries are kept.',
    );
  });
});
