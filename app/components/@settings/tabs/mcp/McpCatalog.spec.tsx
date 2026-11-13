import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createGenerator, type UserConfig } from 'unocss';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  state: {
    settings: { mcpConfig: { mcpServers: {} as Record<string, unknown> } },
    serverTools: {} as Record<string, { status: string }>,
    isInitialized: true,
    isUpdatingConfig: false,
    error: null as string | null,
  },
}));

vi.mock('~/lib/stores/mcp', () => ({
  useMCPStore: (selector: (state: typeof mocks.state) => unknown) => selector(mocks.state),
}));

import McpCatalog, { type McpCatalogProps } from './McpCatalog';
import { BRAND } from '~/lib/brand';
import { GTM_CONNECTORS, getOAuthWorkaround, isOAuthConnector, isTokenConnector } from '~/lib/gtm/connectors';

const tokenConnectors = GTM_CONNECTORS.filter(isTokenConnector);
const oauthConnectors = GTM_CONNECTORS.filter(isOAuthConnector);

/** Static markup escapes text; undo it for the characters used in catalog copy. */
function render(props: McpCatalogProps = {}): string {
  return renderToStaticMarkup(createElement(McpCatalog, props))
    .replaceAll('&#x27;', "'")
    .replaceAll('&quot;', '"')
    .replaceAll('&amp;', '&');
}

const count = (text: string, part: string) => text.split(part).length - 1;

const ROOT = new URL('../../../../../', import.meta.url);

beforeEach(() => {
  mocks.state.settings = { mcpConfig: { mcpServers: {} } };
  mocks.state.serverTools = {};
  mocks.state.isInitialized = true;
  mocks.state.isUpdatingConfig = false;
  mocks.state.error = null;
});

describe('McpCatalog', () => {
  it('explains what connectors are for and where keys go', () => {
    const markup = render();

    expect(markup).toContain('>Data connectors</h2>');
    expect(markup).toContain('Used while building, to read your schema. Apps you build do not stay connected.');
    expect(markup).toContain(
      `Connector keys are saved unencrypted in this browser and are included in settings exports. They are sent to this ${BRAND.name} server, which keeps them in memory to call the vendor. This server has no user accounts: anyone who can open it can use the connectors configured on it and replace them. Add keys only on a server that you alone use, and use read-only, least-privilege keys.`,
    );
  });

  it('locks adding and removing while the configuration editor has unsaved edits', () => {
    const locked = render({ hasUnsavedEdits: true, onDiscardEdits: vi.fn() });
    const unlocked = render();

    expect(locked).toContain(
      'The configuration below has unsaved changes. Save them before adding or removing a connector',
    );
    expect(locked).toContain('discard them</button>');
    expect(count(locked, 'disabled=""')).toBe(tokenConnectors.length);
    expect(unlocked).not.toContain('unsaved changes');
    expect(unlocked).not.toContain('disabled=""');
  });

  it('styles documentation links with the theme link colour', () => {
    const markup = render();

    expect(count(markup, 'text-bolt-elements-messages-linkColor')).toBe(GTM_CONNECTORS.length);
  });

  it('uses only theme colour classes that the style configuration generates', async () => {
    const source = readFileSync(new URL('./McpCatalog.tsx', import.meta.url), 'utf8');
    const themeClasses = [...new Set(source.match(/[\w:-]*bolt-elements-[\w-]+/g))];
    const unoConfig: { default: UserConfig } = await import(new URL('uno.config.ts', ROOT).href);
    const generator = await createGenerator(unoConfig.default);
    const { matched } = await generator.generate(themeClasses.join(' '), { preflights: false });

    expect(themeClasses.length).toBeGreaterThan(10);
    expect(themeClasses.filter((name) => !matched.has(name))).toEqual([]);
  });

  it('offers every token connector with its access level, description and documentation', () => {
    const markup = render();
    const [works, needsSignIn] = markup.split('Needs vendor sign-in (not available yet)');

    expect(works).toContain('>Works today</h3>');
    expect(needsSignIn).toBeDefined();

    for (const connector of tokenConnectors) {
      expect(works).toContain(`>${connector.name}</h4>`);
      expect(works).toContain(connector.description);
      expect(works).toContain(`href="${connector.docsUrl}"`);
      expect(works).toContain(`aria-label="Add ${connector.name}"`);
    }

    expect(count(works, '>Read-only<')).toBe(tokenConnectors.filter((c) => c.access === 'read-only').length);
    expect(count(works, '>May read and write<')).toBe(tokenConnectors.filter((c) => c.access === 'read-write').length);
    expect(markup).not.toContain('disabled=""');
    expect(markup).not.toContain('type="password"');
  });

  it('lists sign-in-only vendors with a workaround and no way to add them', () => {
    const [, needsSignIn] = render().split('Needs vendor sign-in (not available yet)');

    for (const connector of oauthConnectors) {
      expect(needsSignIn).toContain(connector.name);
      expect(needsSignIn).toContain(`href="${connector.docsUrl}"`);
      expect(needsSignIn).toContain(getOAuthWorkaround(connector));
    }

    expect(needsSignIn).not.toContain('<button');
  });

  it('opens documentation in a new tab without handing over the opener', () => {
    const markup = render();

    expect(count(markup, 'target="_blank"')).toBe(GTM_CONNECTORS.length);
    expect(count(markup, 'rel="noopener noreferrer"')).toBe(GTM_CONNECTORS.length);
  });

  it('shows a saved connector as connected or inactive, with a way to remove it', () => {
    mocks.state.settings = { mcpConfig: { mcpServers: { 'gtm-linear': {}, 'gtm-close': {} } } };
    mocks.state.serverTools = { 'gtm-linear': { status: 'available' }, 'gtm-close': { status: 'unavailable' } };

    const markup = render();

    expect(markup).toContain('Connected');
    expect(markup).toContain('Saved, not active on this server');
    expect(markup).toContain('aria-label="Remove Linear MCP server"');
    expect(markup).toContain('aria-label="Remove Close MCP server"');
    expect(markup).not.toContain('aria-label="Add Linear MCP server"');
    expect(markup).not.toContain('aria-label="Add Close MCP server"');
    expect(count(markup, 'aria-label="Add ')).toBe(tokenConnectors.length - 2);
  });

  it('locks every action until the settings are loaded and while they are being saved', () => {
    mocks.state.settings = { mcpConfig: { mcpServers: { 'gtm-linear': {} } } };

    for (const locked of [{ isInitialized: false }, { isUpdatingConfig: true }]) {
      Object.assign(mocks.state, { isInitialized: true, isUpdatingConfig: false }, locked);

      expect(count(render(), 'disabled=""')).toBe(tokenConnectors.length);
    }
  });

  it('locks every action and says why when the saved settings could not be loaded', () => {
    mocks.state.error = 'Error parsing saved mcp config: Unexpected token';

    const markup = render();

    expect(markup).toContain('role="alert"');
    expect(markup).toContain('could not be loaded, so connectors cannot be added or removed right now');
    expect(count(markup, 'disabled=""')).toBe(tokenConnectors.length);
  });
});
