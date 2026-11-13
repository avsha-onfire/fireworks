import { useEffect, useState } from 'react';
import { requestOpenSettings } from '~/lib/gtm/events';
import type { GtmRoleId } from '~/lib/gtm/types';
import { useGtmWorkspace } from '~/lib/hooks/useGtmWorkspace';

/** localStorage flag set when the user closes the nudge. */
export const WORKSPACE_NUDGE_DISMISSED_KEY = 'gtm_workspace_nudge_dismissed';

/** True when the user closed the nudge in this browser. */
export function readWorkspaceNudgeDismissed(): boolean {
  try {
    return localStorage.getItem(WORKSPACE_NUDGE_DISMISSED_KEY) !== null;
  } catch {
    // Storage is blocked: show the nudge, it can still be closed for this visit.
    return false;
  }
}

function saveDismissed() {
  try {
    localStorage.setItem(WORKSPACE_NUDGE_DISMISSED_KEY, 'true');
  } catch (error) {
    console.error('Failed to remember that the workspace nudge was dismissed:', error);
  }
}

export interface WorkspaceNudgeState {
  /** False on the server and on the first client render. */
  mounted: boolean;
  role: GtmRoleId | '';
  dismissed: boolean;
}

/** Shown after mount until the user picks a role or closes it. */
export function shouldShowWorkspaceNudge({ mounted, role, dismissed }: WorkspaceNudgeState): boolean {
  return mounted && !dismissed && role === '';
}

/**
 * Home-screen invitation to set up the GTM workspace, shown until the user
 * picks a role or dismisses it.
 *
 * The landing page is server-rendered and the answer lives in localStorage, so
 * the nudge renders nothing on the server and on the first client render and
 * only appears after mount.
 */
export function WorkspaceNudge() {
  const workspace = useGtmWorkspace();
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(readWorkspaceNudgeDismissed());
    setMounted(true);
  }, []);

  if (!shouldShowWorkspaceNudge({ mounted, role: workspace.role, dismissed })) {
    return null;
  }

  const dismiss = () => {
    saveDismissed();
    setDismissed(true);
  };

  return (
    <section
      aria-label="Workspace setup"
      className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-4 py-2.5"
    >
      <span aria-hidden="true" className="i-ph:users-three h-5 w-5 shrink-0 text-bolt-elements-textSecondary" />
      <p className="min-w-0 flex-1 basis-60 text-sm text-bolt-elements-textSecondary">
        Make every app fit your team: add your role, CRM and deal stages (1 minute)
      </p>
      <button
        type="button"
        onClick={() => requestOpenSettings('gtm-workspace')}
        className="appearance-none rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-1.5 text-sm font-medium text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
      >
        Set up workspace
      </button>
      <button
        type="button"
        aria-label="Dismiss workspace setup"
        onClick={dismiss}
        className="flex h-7 w-7 appearance-none items-center justify-center rounded-md border-0 bg-transparent text-bolt-elements-textTertiary transition-colors hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
      >
        <span aria-hidden="true" className="i-ph:x h-4 w-4" />
      </button>
    </section>
  );
}
