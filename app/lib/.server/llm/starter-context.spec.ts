import { describe, expect, it } from 'vitest';
import { collapseStarterBoilerplate } from './starter-context';
import { BRAND } from '~/lib/brand';

interface ProjectFile {
  path: string;
  content: string;
}

const NOTE_START = '[Read-only shadcn/ui components already in src/components/ui;';

const PREAMBLE = `${BRAND.name} is initializing your project with the required files using the Vite Shadcn template.`;

/** The line that replaces the collapsed component files. */
function componentsNote(names: string[]): string {
  return `${NOTE_START} bodies omitted to save context; read a file with the project tools if you need its exact API: ${names.join(', ')}]`;
}

function fileAction({ path, content }: ProjectFile): string {
  return `<boltAction type="file" filePath="${path}">\n${content}\n</boltAction>`;
}

/** Mirrors the assistant message that a starter template import leaves in the chat. */
function importMessage(files: ProjectFile[], id = 'imported-files', preamble = PREAMBLE): string {
  return [
    '',
    preamble,
    `<boltArtifact id="${id}" title="Build a pipeline review board" type="bundled">`,
    files.map(fileAction).join('\n'),
    '</boltArtifact>',
    '',
  ].join('\n');
}

/** Mirrors the assistant messages that git, zip and folder imports of the user's own project leave in the chat. */
const USER_IMPORT_OPENINGS = [
  'Cloning the repo https://github.com/acme/revops-portal.git into /home/project\n<boltArtifact id="imported-files" title="Git Cloned Files"  type="bundled">',
  'Cloning the repo https://github.com/acme/revops-portal.git into /home/project\n\n<boltArtifact id="imported-files" title="Git Cloned Files" type="bundled">',
  'I\'ve imported the contents of the "revops-portal" ZIP archive.\n\n<boltArtifact id="imported-files" title="Imported Files" type="bundled">',
  'I\'ve imported the contents of the "revops-portal" folder.\n\n<boltArtifact id="imported-files" title="Imported Files" type="bundled" >',
];

function userImportMessage(opening: string, files: ProjectFile[]): string {
  return `${opening}\n${files.map(fileAction).join('\n\n')}\n</boltArtifact>`;
}

const COMPONENTS_JSON = { path: 'components.json', content: '{ "style": "default", "tsx": true }' };
const PACKAGE_JSON = { path: 'package.json', content: '{ "name": "starter", "scripts": { "dev": "vite" } }' };
const APP = { path: 'src/App.tsx', content: 'export default function App() {\n  return <main />;\n}' };
const BUTTON = { path: 'src/components/ui/button.tsx', content: 'export const Button = "BUTTON_BODY";' };
const CARD = { path: 'src/components/ui/card.tsx', content: 'export const Card = "CARD_BODY";' };
const TABLE = { path: 'src/components/ui/table.tsx', content: 'export const Table = "TABLE_BODY";' };
const USE_TOAST = { path: 'src/hooks/use-toast.ts', content: 'export const useToast = () => [];' };
const UTILS = { path: 'src/lib/utils.ts', content: 'export const cn = (...names: string[]) => names.join(" ");' };

const STARTER_FILES = [COMPONENTS_JSON, PACKAGE_JSON, APP, BUTTON, CARD, TABLE, USE_TOAST, UTILS];

const LATER_ARTIFACT = [
  '<boltArtifact id="deal-table" title="Add a deal table" type="bundled">',
  fileAction({ path: 'src/components/ui/deal-table.tsx', content: 'export const DealTable = "DEAL_TABLE_BODY";' }),
  '</boltArtifact>',
].join('\n');

describe('collapseStarterBoilerplate', () => {
  it('returns text without an imported-files artifact unchanged', () => {
    for (const text of ['', 'Build a pipeline review board', LATER_ARTIFACT, importMessage(STARTER_FILES, 'setup')]) {
      expect(collapseStarterBoilerplate(text)).toBe(text);
    }
  });

  it('replaces the component bodies with one note that lists the file names', () => {
    const collapsed = collapseStarterBoilerplate(importMessage(STARTER_FILES));

    expect(collapsed).toBe(
      [
        '',
        PREAMBLE,
        '<boltArtifact id="imported-files" title="Build a pipeline review board" type="bundled">',
        fileAction(COMPONENTS_JSON),
        fileAction(PACKAGE_JSON),
        fileAction(APP),
        componentsNote(['button.tsx', 'card.tsx', 'table.tsx']),
        fileAction(USE_TOAST),
        fileAction(UTILS),
        '</boltArtifact>',
        '',
      ].join('\n'),
    );
  });

  it('keeps every other file of the import byte for byte', () => {
    const collapsed = collapseStarterBoilerplate(importMessage(STARTER_FILES));

    for (const file of [COMPONENTS_JSON, PACKAGE_JSON, APP, USE_TOAST, UTILS]) {
      expect(collapsed).toContain(fileAction(file));
    }

    for (const body of ['BUTTON_BODY', 'CARD_BODY', 'TABLE_BODY']) {
      expect(collapsed).not.toContain(body);
    }

    expect(collapsed).not.toContain('filePath="src/components/ui/');
  });

  it('collapses component files that are not next to each other and keeps nested paths', () => {
    const chart = { path: 'src/components/ui/charts/bar-chart.tsx', content: 'export const BarChart = "CHART_BODY";' };
    const collapsed = collapseStarterBoilerplate(importMessage([BUTTON, COMPONENTS_JSON, CARD, APP, chart]));

    expect(collapsed).toContain(
      [
        componentsNote(['button.tsx', 'card.tsx', 'charts/bar-chart.tsx']),
        fileAction(COMPONENTS_JSON),
        fileAction(APP),
        '</boltArtifact>',
      ].join('\n'),
    );
    expect(collapsed.split(NOTE_START)).toHaveLength(2);
  });

  it('leaves component files outside the imported-files artifact alone', () => {
    const earlier = LATER_ARTIFACT.replace('deal-table', 'earlier-table');
    const text = `${earlier}\n${importMessage(STARTER_FILES)}\nHere is the new table.\n${LATER_ARTIFACT}\nDone.`;
    const collapsed = collapseStarterBoilerplate(text);

    expect(collapsed.startsWith(`${earlier}\n`)).toBe(true);
    expect(collapsed.endsWith(`\nHere is the new table.\n${LATER_ARTIFACT}\nDone.`)).toBe(true);
    expect(collapsed).toContain('DEAL_TABLE_BODY');
    expect(collapsed).not.toContain('BUTTON_BODY');
  });

  it.each(USER_IMPORT_OPENINGS)("returns the user's own git, zip or folder import byte for byte: %s", (opening) => {
    const dealTable = {
      path: 'src/components/ui/DealTable.tsx',
      content: 'export const DealTable = "DEAL_TABLE_BODY";',
    };

    const text = userImportMessage(opening, [COMPONENTS_JSON, PACKAGE_JSON, APP, BUTTON, dealTable]);

    expect(collapseStarterBoilerplate(text)).toBe(text);
  });

  it("collapses the starter but not a user's import later in the same text", () => {
    const dealTable = {
      path: 'src/components/ui/DealTable.tsx',
      content: 'export const DealTable = "DEAL_TABLE_BODY";',
    };

    const userImport = userImportMessage(USER_IMPORT_OPENINGS[0], [COMPONENTS_JSON, dealTable]);
    const collapsed = collapseStarterBoilerplate(`${importMessage(STARTER_FILES)}\n${userImport}`);

    expect(collapsed).not.toContain('BUTTON_BODY');
    expect(collapsed.endsWith(`\n${userImport}`)).toBe(true);
  });

  it('recognises the preamble of chats saved under the upstream product name', () => {
    const legacy = importMessage(
      STARTER_FILES,
      'imported-files',
      'Bolt is initializing your project with the required files using the Vite Shadcn template.',
    );

    expect(collapseStarterBoilerplate(legacy)).toContain(componentsNote(['button.tsx', 'card.tsx', 'table.tsx']));
  });

  it.each([
    ['text between the preamble and the artifact', `${PREAMBLE}\nCloning the repo https://github.com/acme/app.git`],
    ['the preamble quoted inside a longer line', `As before, ${PREAMBLE}`],
    ['a preamble under another product name', PREAMBLE.replace(BRAND.name, 'Acme')],
    ['a preamble without its template name', `${BRAND.name} is initializing your project with the required files.`],
  ])('does not collapse an artifact after %s', (_case, line) => {
    const text = importMessage(STARTER_FILES, 'imported-files', line);

    expect(collapseStarterBoilerplate(text)).toBe(text);
  });

  it('leaves an imported project without the shadcn/ui manifest alone', () => {
    const ownComponents = importMessage([PACKAGE_JSON, APP, BUTTON, CARD]);

    expect(collapseStarterBoilerplate(ownComponents)).toBe(ownComponents);
  });

  it('leaves an import without component files alone', () => {
    const text = importMessage([COMPONENTS_JSON, PACKAGE_JSON, APP]);

    expect(collapseStarterBoilerplate(text)).toBe(text);
  });

  it('collapses every starter artifact in the text', () => {
    const text = `${importMessage(STARTER_FILES)}${importMessage([COMPONENTS_JSON, TABLE])}`;
    const collapsed = collapseStarterBoilerplate(text);

    expect(collapsed.split(NOTE_START)).toHaveLength(3);
    expect(collapsed).not.toContain('TABLE_BODY');
  });

  it('is idempotent', () => {
    const once = collapseStarterBoilerplate(`${importMessage(STARTER_FILES)}\n${LATER_ARTIFACT}`);

    expect(collapseStarterBoilerplate(once)).toBe(once);
  });

  it('leaves an artifact that never closes unchanged', () => {
    const text = importMessage(STARTER_FILES).replace('</boltArtifact>', '');

    expect(collapseStarterBoilerplate(text)).toBe(text);
  });

  it('stops at a component file that never closes', () => {
    const complete = importMessage([COMPONENTS_JSON, BUTTON, CARD]);
    const cut = complete.replace(`${CARD.content}\n</boltAction>`, CARD.content);
    const collapsed = collapseStarterBoilerplate(cut);

    expect(collapsed).toContain(`${componentsNote(['button.tsx'])}\n<boltAction type="file" filePath="${CARD.path}">`);
    expect(collapsed).toContain(`<boltAction type="file" filePath="${CARD.path}">\n${CARD.content}\n</boltArtifact>`);
  });

  it('skips a file action with an implausibly long path', () => {
    const text = importMessage([
      COMPONENTS_JSON,
      { path: `src/components/ui/${'x'.repeat(500)}.tsx`, content: 'export const Long = "LONG_BODY";' },
      BUTTON,
    ]);

    const collapsed = collapseStarterBoilerplate(text);

    expect(collapsed).toContain('LONG_BODY');
    expect(collapsed).toContain(componentsNote(['button.tsx']));
    expect(collapsed).not.toContain('BUTTON_BODY');
  });

  it('shrinks a starter-sized import to a fraction of its size', () => {
    const components = Array.from({ length: 47 }, (_, index) => ({
      path: `src/components/ui/component-${index}.tsx`,
      content: `export const Component${index} = () => null;\n${'// filler line of component source\n'.repeat(80)}`,
    }));

    const text = importMessage([COMPONENTS_JSON, PACKAGE_JSON, APP, ...components, USE_TOAST, UTILS]);
    const collapsed = collapseStarterBoilerplate(text);

    expect(text.length).toBeGreaterThan(120_000);
    expect(collapsed.length).toBeLessThan(2_500);
    expect(collapsed).toContain('component-0.tsx, component-1.tsx');
    expect(collapsed).toContain('component-46.tsx]');
  });

  it('stays fast on 400 KB of well-formed and of malformed input', () => {
    const body = 'export const Row = () => null;\n'.repeat(260);

    const wellFormed = importMessage([
      COMPONENTS_JSON,
      ...Array.from({ length: 50 }, (_, index) => ({ path: `src/components/ui/row-${index}.tsx`, content: body })),
    ]);
    const unterminated = importMessage([
      COMPONENTS_JSON,
      { path: 'src/App.tsx', content: '<boltAction type="file" filePath="src/components/ui/'.repeat(8_000) },
    ]);

    const unclosedArtifacts = '<boltArtifact id="imported-files" title="x" type="bundled">\n'.repeat(7_000);

    for (const text of [wellFormed, unterminated, unclosedArtifacts]) {
      expect(text.length).toBeGreaterThan(400_000);

      const started = performance.now();

      collapseStarterBoilerplate(text);

      expect(performance.now() - started).toBeLessThan(500);
    }
  });
});
