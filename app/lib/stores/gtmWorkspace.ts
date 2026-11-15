import { atom } from 'nanostores';
import type { GtmWorkspaceContext } from '~/lib/gtm/types';
import { DEFAULT_GTM_WORKSPACE, sanitizeGtmWorkspace } from '~/lib/gtm/workspace';

/** localStorage key. Also listed in the settings export/import service. */
export const GTM_WORKSPACE_STORAGE_KEY = 'gtm_workspace';

function loadWorkspace(): GtmWorkspaceContext {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_GTM_WORKSPACE };
  }

  try {
    const stored = localStorage.getItem(GTM_WORKSPACE_STORAGE_KEY);

    if (stored) {
      return sanitizeGtmWorkspace(JSON.parse(stored));
    }
  } catch (error) {
    console.error('Failed to load the saved GTM workspace:', error);
  }

  return { ...DEFAULT_GTM_WORKSPACE };
}

function persist(workspace: GtmWorkspaceContext) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(GTM_WORKSPACE_STORAGE_KEY, JSON.stringify(workspace));
  } catch (error) {
    console.error('Failed to save the GTM workspace:', error);
  }
}

/**
 * The user's GTM workspace context.
 *
 * In the browser this is filled from localStorage as soon as the module
 * loads, while the server only has the defaults. Server-rendered components
 * (everything on the landing page) must read it through `useGtmWorkspace`,
 * not `useStore`, or they hydrate with different markup.
 */
export const gtmWorkspaceStore = atom<GtmWorkspaceContext>(loadWorkspace());

export function updateGtmWorkspace(updates: Partial<GtmWorkspaceContext>) {
  const next = sanitizeGtmWorkspace({ ...gtmWorkspaceStore.get(), ...updates });

  gtmWorkspaceStore.set(next);
  persist(next);
}

export function resetGtmWorkspace() {
  const next = { ...DEFAULT_GTM_WORKSPACE };

  gtmWorkspaceStore.set(next);
  persist(next);
}
