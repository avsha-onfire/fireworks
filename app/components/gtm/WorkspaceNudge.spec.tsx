import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  WORKSPACE_NUDGE_DISMISSED_KEY,
  WorkspaceNudge,
  readWorkspaceNudgeDismissed,
  shouldShowWorkspaceNudge,
} from './WorkspaceNudge';
import { gtmWorkspaceStore } from '~/lib/stores/gtmWorkspace';

function storageWith(entries: Record<string, string>) {
  return { getItem: (key: string) => entries[key] ?? null };
}

describe('WorkspaceNudge', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders nothing on the server, even for a workspace with no role', () => {
    expect(gtmWorkspaceStore.get().role).toBe('');
    expect(renderToStaticMarkup(createElement(WorkspaceNudge))).toBe('');
  });

  it('keeps its dismissal flag under a stable storage key', () => {
    expect(WORKSPACE_NUDGE_DISMISSED_KEY).toBe('gtm_workspace_nudge_dismissed');
  });

  it('shows after mount while no role is picked and it was not dismissed', () => {
    expect(shouldShowWorkspaceNudge({ mounted: true, role: '', dismissed: false })).toBe(true);
  });

  it('stays hidden before mount, once dismissed, or once a role is picked', () => {
    expect(shouldShowWorkspaceNudge({ mounted: false, role: '', dismissed: false })).toBe(false);
    expect(shouldShowWorkspaceNudge({ mounted: true, role: '', dismissed: true })).toBe(false);
    expect(shouldShowWorkspaceNudge({ mounted: true, role: 'revops', dismissed: false })).toBe(false);
  });

  it('reads the dismissal from storage', () => {
    vi.stubGlobal('localStorage', storageWith({ [WORKSPACE_NUDGE_DISMISSED_KEY]: 'true' }));
    expect(readWorkspaceNudgeDismissed()).toBe(true);

    vi.stubGlobal('localStorage', storageWith({}));
    expect(readWorkspaceNudgeDismissed()).toBe(false);
  });

  it('treats blocked or missing storage as not dismissed', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError');
      },
    });
    expect(readWorkspaceNudgeDismissed()).toBe(false);

    vi.stubGlobal('localStorage', undefined);
    expect(readWorkspaceNudgeDismissed()).toBe(false);
  });
});
