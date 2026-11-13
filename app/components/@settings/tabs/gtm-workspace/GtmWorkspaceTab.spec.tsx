import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import GtmWorkspaceTab from './GtmWorkspaceTab';
import { BRAND } from '~/lib/brand';
import { formatGtmWorkspaceForPrompt } from '~/lib/gtm/workspace';
import { gtmWorkspaceStore, resetGtmWorkspace, updateGtmWorkspace } from '~/lib/stores/gtmWorkspace';

function render() {
  return renderToStaticMarkup(createElement(GtmWorkspaceTab));
}

/** Undoes the HTML escaping React applies to text. */
function unescape(markup: string) {
  return markup
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#x27;', "'")
    .replaceAll('&amp;', '&');
}

describe('GtmWorkspaceTab', () => {
  afterEach(() => {
    resetGtmWorkspace();
  });

  it('discloses where the workspace details go', () => {
    expect(render()).toContain(
      `${BRAND.name} adds these details to the instructions sent with every chat and prompt-enhance request. They are stored unencrypted in this browser, pass through this ${BRAND.name} server and go to the AI provider you select. Do not enter confidential or personal information.`,
    );
  });

  it('shows the full form and says nothing is sent for an empty workspace', () => {
    const markup = render();

    expect(markup).toContain('>Primary sales motion</label>');
    expect(markup).toContain('Show what is sent</summary>');
    expect(markup).not.toContain('<pre');
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Clear workspace<\/button>/);
  });

  it('prints exactly what is added to the instructions', () => {
    updateGtmWorkspace({
      role: 'revops',
      companyName: 'Acme',
      crm: 'hubspot',
      dealStages: 'Discovery, Demo, Proposal',
      revenueModel: 'subscription',
    });

    const markup = render();
    const expected = formatGtmWorkspaceForPrompt(gtmWorkspaceStore.get());

    expect(expected).toContain('- Company: Acme');
    expect(unescape(/<pre[^>]*>([\s\S]*?)<\/pre>/.exec(markup)?.[1] ?? '')).toBe(expected);
    expect(markup).not.toMatch(/<button[^>]*disabled=""[^>]*>Clear workspace<\/button>/);
    expect(markup).toContain('>Clear workspace</button>');
  });

  it('keeps a list typed one item per line apart in what is sent', () => {
    updateGtmWorkspace({ segments: 'Enterprise\nMid-market\nSMB' });

    expect(render()).toContain('- Segments: Enterprise; Mid-market; SMB');
  });
});
