import { useStore } from '@nanostores/react';
import { useState } from 'react';
import { toast } from 'react-toastify';
import { GtmWorkspaceForm } from '~/components/gtm/GtmWorkspaceForm';
import { Button } from '~/components/ui/Button';
import { BRAND } from '~/lib/brand';
import type { GtmWorkspaceContext } from '~/lib/gtm/types';
import { formatGtmWorkspaceForPrompt, hasGtmWorkspaceContext } from '~/lib/gtm/workspace';
import { gtmWorkspaceStore, resetGtmWorkspace, updateGtmWorkspace } from '~/lib/stores/gtmWorkspace';

const DISCLOSURE = `${BRAND.name} adds these details to the instructions sent with every chat and prompt-enhance request. They are stored unencrypted in this browser, pass through this ${BRAND.name} server and go to the AI provider you select. Do not enter confidential or personal information.`;

export default function GtmWorkspaceTab() {
  const saved = useStore(gtmWorkspaceStore);

  /*
   * The store cleans every value it is given (trims, collapses whitespace,
   * falls back to a default currency), which would fight the cursor if the
   * inputs were bound to it directly. The form therefore edits a draft, each
   * change is saved straight away, and the draft is replaced by the saved
   * value when focus leaves a field.
   */
  const [draft, setDraft] = useState<GtmWorkspaceContext>(saved);
  const preview = formatGtmWorkspaceForPrompt(saved);

  const handleChange = (updates: Partial<GtmWorkspaceContext>) => {
    setDraft((current) => ({ ...current, ...updates }));
    updateGtmWorkspace(updates);
  };

  const handleClear = () => {
    if (!window.confirm('Clear all workspace details saved in this browser? This cannot be undone.')) {
      return;
    }

    resetGtmWorkspace();
    setDraft(gtmWorkspaceStore.get());
    toast.success('Workspace cleared');
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-lg font-medium text-bolt-elements-textPrimary">GTM Workspace</h2>
        <p className="mt-1 text-sm text-bolt-elements-textSecondary">
          Tell {BRAND.name} about your team so the apps it builds use your stages, segments and vocabulary. Every field
          is optional and changes are saved as you type.
        </p>
      </div>

      <p className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3 text-sm text-bolt-elements-textSecondary">
        {DISCLOSURE}
      </p>

      <div onBlur={() => setDraft(gtmWorkspaceStore.get())}>
        <GtmWorkspaceForm variant="full" value={draft} onChange={handleChange} />
      </div>

      <details className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1">
        <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-bolt-elements-textPrimary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500">
          Show what is sent
        </summary>
        <div className="border-t border-bolt-elements-borderColor p-3">
          {preview ? (
            <pre className="whitespace-pre-wrap break-words font-mono text-xs text-bolt-elements-textSecondary">
              {preview}
            </pre>
          ) : (
            <p className="text-sm text-bolt-elements-textSecondary">
              Nothing yet. Workspace details are only sent once you fill in a field above.
            </p>
          )}
        </div>
      </details>

      <div className="flex items-center justify-between gap-3 border-t border-bolt-elements-borderColor pt-4">
        <p className="text-xs text-bolt-elements-textSecondary">
          Clearing removes these details from this browser and from future requests.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleClear}
          disabled={!hasGtmWorkspaceContext(saved)}
        >
          Clear workspace
        </Button>
      </div>
    </div>
  );
}
