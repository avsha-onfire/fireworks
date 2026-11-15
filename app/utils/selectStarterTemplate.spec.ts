import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTemplates, selectStarterTemplate } from './selectStarterTemplate';
import { collapseStarterBoilerplate } from '~/lib/.server/llm/starter-context';
import { BRAND } from '~/lib/brand';
import { wrapDataFileSummary } from '~/lib/gtm/data-file-block';
import { DEFAULT_STARTER_TEMPLATE } from '~/lib/gtm/starter-selection';

describe('getTemplates', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('instructs the model to implement the original request after importing a template', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify([
            { name: 'package.json', path: 'package.json', content: '{"scripts":{"dev":"vite"}}' },
            { name: 'prompt', path: '.bolt/prompt', content: 'Keep the starter structure.' },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    const result = await getTemplates('Vite React', 'Kanban board');

    expect(result?.userMessage).toContain('Do not stop after a plan');
    expect(result?.userMessage).toContain('ask whether to proceed');
    expect(result?.userMessage).toContain('install dependencies if needed, start the app, and run relevant checks');
    expect(result?.userMessage).toContain('Keep the starter structure.');
    expect(result?.assistantMessage).toContain('<boltArtifact id="imported-files"');
    expect(result?.setupMessage).toContain('<boltArtifact id="project-setup"');
    expect(result?.setupMessage).toContain('<boltAction type="shell">npm install --no-audit --no-fund</boltAction>');
    expect(result?.setupMessage).toContain('<boltAction type="start">npm run dev</boltAction>');
  });

  it('introduces the imported files under the product name', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify([{ name: 'package.json', path: 'package.json', content: '{}' }]), {
          status: 200,
        }),
      ),
    );

    const result = await getTemplates(DEFAULT_STARTER_TEMPLATE, 'Build a pipeline review board');

    expect(result?.assistantMessage).toContain(
      `${BRAND.name} is initializing your project with the required files using the ${DEFAULT_STARTER_TEMPLATE} template.`,
    );
    expect(result?.assistantMessage).not.toContain('Bolt is initializing');
    expect(result?.assistantMessage).toContain(
      '<boltArtifact id="imported-files" title="Build a pipeline review board"',
    );
  });

  it('produces a starter message whose stock components the server collapses for the model', async () => {
    const files = [
      { name: 'components.json', path: 'components.json', content: '{ "style": "default", "tsx": true }' },
      { name: 'package.json', path: 'package.json', content: '{"scripts":{"dev":"vite"}}' },
      { name: 'App.tsx', path: 'src/App.tsx', content: 'export default function App() { return "APP_BODY"; }' },
      { name: 'button.tsx', path: 'src/components/ui/button.tsx', content: 'export const Button = "BUTTON_BODY";' },
      { name: 'table.tsx', path: 'src/components/ui/table.tsx', content: 'export const Table = "TABLE_BODY";' },
    ];

    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(files), { status: 200 })),
    );

    const result = await getTemplates(DEFAULT_STARTER_TEMPLATE, 'Build a pipeline review board');
    const assistantMessage = result?.assistantMessage ?? '';
    const collapsed = collapseStarterBoilerplate(assistantMessage);

    expect(assistantMessage).toContain('BUTTON_BODY');
    expect(collapsed).toContain(
      '[Read-only shadcn/ui components already in src/components/ui; bodies omitted to save context; read a file with the project tools if you need its exact API: button.tsx, table.tsx]',
    );
    expect(collapsed).not.toContain('BUTTON_BODY');
    expect(collapsed).not.toContain('TABLE_BODY');
    expect(collapsed).toContain('APP_BODY');
    expect(collapsed).toContain('<boltAction type="file" filePath="components.json">');
    expect(collapseStarterBoilerplate(collapsed)).toBe(collapsed);
  });
});

describe('selectStarterTemplate', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(['Find food near 26003', 'Find food near 26003 using browser use', 'Explain how React hooks work'])(
    'does not initialize a project for the information request %s',
    async (message) => {
      expect((await selectStarterTemplate({ message })).template).toBe('blank');
    },
  );

  it('keeps a starter when research is part of a build request', async () => {
    expect(
      (await selectStarterTemplate({ message: 'Research local restaurants and build a React food finder' })).template,
    ).toBe('Vite React');
  });

  it.each([
    ['Make a React kanban board', 'Vite React'],
    ['Make a hello world blog using Astro', 'Basic Astro'],
  ])('selects the explicitly requested framework for %s without a model call', async (message, template) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await selectStarterTemplate({
      message,
      model: 'free-model',
      provider: { name: 'OpenRouter', staticModels: [] },
    });

    expect(result.template).toBe(template);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('starts app requests that name no framework from the shadcn starter', async () => {
    expect(DEFAULT_STARTER_TEMPLATE).toBe('Vite Shadcn');
    expect(await selectStarterTemplate({ message: 'Build a pipeline review dashboard' })).toEqual({
      template: 'Vite Shadcn',
      title: 'Build a pipeline review dashboard',
    });
  });

  it.each([
    'Build a cold call script library',
    'Build a solid pipeline dashboard',
    'Build a trade expo lead tracker',
    'Build a content remix tool',
  ])('does not mistake sales and marketing wording for a framework or a throwaway task in %s', async (message) => {
    expect(await selectStarterTemplate({ message })).toEqual({ template: 'Vite Shadcn', title: message });
  });

  it.each([
    ['Build a SolidJS dashboard for pipeline', 'SolidJS'],
    ['Build an Expo app for booth lead capture', 'Expo App'],
    ['Build a Remix app for deal registration', 'Remix Typescript'],
    ['Build a quota dashboard with shadcn', 'Vite Shadcn'],
    ['Write a script that renames my export files', 'blank'],
    ['Build a todo app with Solid', 'SolidJS'],
    ['Build a landing page in Solid', 'SolidJS'],
    ['Build a blog in Remix', 'Remix Typescript'],
    ['Create a Remix site for my portfolio', 'Remix Typescript'],
    ['Build a todo list app using Expo', 'Expo App'],
    ['Write a Python script to rename files using a CLI tool', 'blank'],
    ['Create a node script that pings URLs and prints a status board', 'blank'],
    ['Write a bash script for my build tools', 'blank'],
  ])('still honours the technical meaning in %s', async (message, template) => {
    expect((await selectStarterTemplate({ message })).template).toBe(template);
  });

  it('ignores what an attached data-file summary mentions', async () => {
    const summary = wrapDataFileSummary(
      [
        'Data file summary, generated in the browser from tools.csv.',
        'Tool - category - React, Vue, Next.js, Astro',
        'Notes - text - e.g. "one-off script" for <admins>',
      ].join('\n'),
    );

    expect(await selectStarterTemplate({ message: `Build a tool adoption tracker.\n\n${summary}` })).toEqual({
      template: 'Vite Shadcn',
      title: 'Build a tool adoption tracker',
    });
    expect(await selectStarterTemplate({ message: `${summary}\n\nExplain which tools overlap.` })).toEqual({
      template: 'blank',
      title: 'Explain which tools overlap',
    });
  });

  it('gives a message that is only a data-file summary a placeholder title', async () => {
    const summary = wrapDataFileSummary('Data file summary, generated in the browser from "pipeline".csv.');

    expect(await selectStarterTemplate({ message: summary })).toEqual({
      template: 'Vite Shadcn',
      title: 'Untitled Project',
    });
  });

  it('titles the chat with the first sentence, free of characters that would break the artifact tag', async () => {
    const framework = await selectStarterTemplate({
      message: 'Make a React "kanban" board for <deals>. Add swimlanes by rep.',
    });

    const information = await selectStarterTemplate({ message: 'Explain how "weighted pipeline" works.\nBe brief.' });
    const longRequest = await selectStarterTemplate({ message: `Build ${'a quota dashboard and '.repeat(20)}more` });

    expect(framework).toEqual({ template: 'Vite React', title: 'Make a React kanban board for deals' });
    expect(information).toEqual({ template: 'blank', title: 'Explain how weighted pipeline works' });
    expect(longRequest.title.length).toBeLessThanOrEqual(100);
    expect(longRequest.title).toMatch(/^Build a quota dashboard and .* (?:a|quota|dashboard|and)$/);
  });
});
