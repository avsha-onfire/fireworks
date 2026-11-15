import { useState, type FormEvent } from 'react';
import { toast } from 'react-toastify';
import {
  AccessBadge,
  DocsLink,
  INPUT_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from '~/components/gtm/ConnectorParts';
import ConnectorSignIn from '~/components/gtm/ConnectorSignIn';
import { Dialog, DialogDescription, DialogRoot, DialogTitle } from '~/components/ui/Dialog';
import { BRAND } from '~/lib/brand';
import {
  addGtmConnector,
  getGtmConnectorState,
  removeGtmConnector,
  type GtmConnectorState,
} from '~/lib/gtm/connector-activation';
import {
  GTM_CONNECTORS,
  getGtmConnectorCategoryLabel,
  getOAuthWorkaround,
  isOAuthConnector,
  isSignInConnector,
  isTokenConnector,
  type GtmConnectorField,
  type GtmOAuthConnector,
  type GtmTokenConnector,
} from '~/lib/gtm/connectors';
import { useMCPStore } from '~/lib/stores/mcp';
import { classNames } from '~/utils/classNames';

const TOKEN_CONNECTORS = GTM_CONNECTORS.filter(isTokenConnector);

/** Sign-in vendors this build cannot connect yet; the ones it can are in `ConnectorSignIn`. */
const OAUTH_CONNECTORS = GTM_CONNECTORS.filter(
  (connector): connector is GtmOAuthConnector => isOAuthConnector(connector) && !isSignInConnector(connector),
);

const KEY_NOTICE = `Connector keys are saved unencrypted in this browser and are included in settings exports. They are sent to this ${BRAND.name} server, which keeps them in memory to call the vendor. This server has no user accounts: anyone who can open it can use the connectors configured on it and replace them. Add keys only on a server that you alone use, and use read-only, least-privilege keys.`;

function initialValues(fields: GtmConnectorField[]): Record<string, string> {
  return Object.fromEntries(fields.map((field) => [field.key, field.options?.[0]?.value ?? '']));
}

function CredentialDialog({ connector, onClose }: { connector: GtmTokenConnector; onClose: () => void }) {
  const [values, setValues] = useState(() => initialValues(connector.fields));
  const [error, setError] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const setValue = (key: string, value: string) => setValues((current) => ({ ...current, [key]: value }));

  const close = () => {
    if (!isAdding) {
      onClose();
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsAdding(true);
    setError('');

    try {
      await addGtmConnector(connector, values);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : `${connector.name} could not be added.`);
      setIsAdding(false);

      return;
    }

    toast.success(`${connector.name} is connected.`);
    onClose();
  };

  return (
    <DialogRoot open onOpenChange={(open) => !open && close()}>
      <Dialog className="max-w-[min(520px,calc(100vw-2rem))] p-6" showCloseButton onClose={close}>
        <DialogTitle>Connect {connector.name}</DialogTitle>
        <DialogDescription>{connector.note}</DialogDescription>
        <form onSubmit={(event) => void handleSubmit(event)} className="mt-4 space-y-4">
          {connector.fields.map((field) => {
            const inputId = `gtm-connector-field-${field.key}`;
            const helpId = field.helpText ? `${inputId}-help` : undefined;

            return (
              <div key={field.key}>
                <label htmlFor={inputId} className="block text-sm font-medium text-bolt-elements-textPrimary">
                  {field.label}
                </label>
                {field.options ? (
                  <select
                    id={inputId}
                    value={values[field.key]}
                    onChange={(event) => setValue(field.key, event.target.value)}
                    aria-describedby={helpId}
                    disabled={isAdding}
                    className={INPUT_CLASS}
                  >
                    {field.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={inputId}
                    type={field.secret ? 'password' : 'text'}
                    autoComplete={field.secret ? 'new-password' : 'off'}
                    autoCapitalize="off"
                    spellCheck={false}
                    required
                    value={values[field.key]}
                    onChange={(event) => setValue(field.key, event.target.value)}
                    placeholder={field.placeholder}
                    aria-describedby={helpId}
                    disabled={isAdding}
                    className={INPUT_CLASS}
                  />
                )}
                {field.helpText && (
                  <p id={helpId} className="mt-1 text-xs text-bolt-elements-textSecondary">
                    {field.helpText}
                  </p>
                )}
              </div>
            );
          })}
          {error && (
            <p role="alert" className="text-sm text-bolt-elements-icon-error">
              {error}
            </p>
          )}
          <p className="text-xs text-bolt-elements-textTertiary">
            Endpoint and sign-in method checked against the {connector.vendor} documentation on {connector.verifiedOn}.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={close} disabled={isAdding} className={SECONDARY_BUTTON_CLASS}>
              Cancel
            </button>
            <button type="submit" disabled={isAdding} className={PRIMARY_BUTTON_CLASS}>
              {isAdding ? 'Connecting…' : 'Add connector'}
            </button>
          </div>
        </form>
      </Dialog>
    </DialogRoot>
  );
}

const STATE_LABELS: Record<Exclude<GtmConnectorState, 'not-added'>, { label: string; icon: string; tone: string }> = {
  active: { label: 'Connected', icon: 'i-ph:check-circle', tone: 'text-bolt-elements-icon-success' },
  'saved-inactive': {
    label: 'Saved, not active on this server',
    icon: 'i-ph:warning-circle',
    tone: 'text-bolt-elements-textSecondary',
  },
};

export interface McpCatalogProps {
  /**
   * True while the configuration editor below has unsaved edits. Adding or
   * removing a connector saves the configuration and reloads that editor, which
   * would silently drop those edits, so both actions wait until they are
   * saved or discarded.
   */
  hasUnsavedEdits?: boolean;

  /** Throws away the editor's unsaved edits. */
  onDiscardEdits?: () => void;
}

export default function McpCatalog({ hasUnsavedEdits = false, onDiscardEdits }: McpCatalogProps) {
  const settings = useMCPStore((state) => state.settings);
  const serverTools = useMCPStore((state) => state.serverTools);
  const isInitialized = useMCPStore((state) => state.isInitialized);
  const isUpdatingConfig = useMCPStore((state) => state.isUpdatingConfig);
  const loadError = useMCPStore((state) => state.error);

  const [dialogConnector, setDialogConnector] = useState<GtmTokenConnector | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const isLocked = !isInitialized || isUpdatingConfig || removingId !== null || Boolean(loadError) || hasUnsavedEdits;

  const handleRemove = async (connector: GtmTokenConnector) => {
    setRemovingId(connector.id);

    try {
      await removeGtmConnector(connector.id);
      toast.info(`${connector.name} was removed.`);
    } catch (removeError) {
      toast.error(removeError instanceof Error ? removeError.message : `${connector.name} could not be removed.`);
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <section aria-labelledby="gtm-connectors-heading" className="space-y-5">
      <div>
        <h2 id="gtm-connectors-heading" className="text-base font-medium text-bolt-elements-textPrimary">
          Data connectors
        </h2>
        <p className="mt-1 text-sm text-bolt-elements-textSecondary">
          Used while building, to read your schema. Apps you build do not stay connected.
        </p>
      </div>

      <div
        role="note"
        className="flex gap-2 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3 text-xs text-bolt-elements-textSecondary"
      >
        <span className="i-ph:shield-warning mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>{KEY_NOTICE}</p>
      </div>

      {loadError && (
        <p role="alert" className="text-sm text-bolt-elements-icon-error">
          Your saved connector settings could not be loaded, so connectors cannot be added or removed right now. Reload
          the page to try again.
        </p>
      )}

      {hasUnsavedEdits && !loadError && (
        <p role="status" className="text-sm text-bolt-elements-textSecondary">
          The configuration below has unsaved changes. Save them before adding or removing a connector
          {onDiscardEdits ? ', or ' : '.'}
          {onDiscardEdits && (
            <>
              <button
                type="button"
                onClick={onDiscardEdits}
                className="bg-transparent p-0 text-bolt-elements-messages-linkColor underline"
              >
                discard them
              </button>
              .
            </>
          )}
        </p>
      )}

      <div aria-labelledby="gtm-connectors-token-heading" role="group" className="space-y-3">
        <h3 id="gtm-connectors-token-heading" className="text-sm font-medium text-bolt-elements-textPrimary">
          Works today
        </h3>
        <ul className="space-y-2">
          {TOKEN_CONNECTORS.map((connector) => {
            const state = getGtmConnectorState(connector.id, settings, serverTools);

            return (
              <li
                key={connector.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4"
              >
                <div className="min-w-0 flex-1 basis-64">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-sm font-semibold text-bolt-elements-textPrimary">{connector.name}</h4>
                    <AccessBadge access={connector.access} />
                  </div>
                  <p className="text-xs text-bolt-elements-textTertiary">
                    {connector.vendor} · {getGtmConnectorCategoryLabel(connector.category)}
                  </p>
                  <p className="mt-1 text-sm text-bolt-elements-textSecondary">{connector.description}</p>
                  <div className="mt-1.5">
                    <DocsLink connector={connector} />
                  </div>
                </div>
                {state === 'not-added' ? (
                  <button
                    type="button"
                    onClick={() => setDialogConnector(connector)}
                    disabled={isLocked}
                    aria-label={`Add ${connector.name}`}
                    className={PRIMARY_BUTTON_CLASS}
                  >
                    Add
                  </button>
                ) : (
                  <div className="flex shrink-0 items-center gap-3">
                    <span className={classNames('flex items-center gap-1 text-xs', STATE_LABELS[state].tone)}>
                      <span className={classNames(STATE_LABELS[state].icon, 'h-4 w-4')} aria-hidden="true" />
                      {STATE_LABELS[state].label}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleRemove(connector)}
                      disabled={isLocked}
                      aria-label={`Remove ${connector.name}`}
                      className={SECONDARY_BUTTON_CLASS}
                    >
                      {removingId === connector.id ? 'Removing…' : 'Remove'}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <ConnectorSignIn />

      <div aria-labelledby="gtm-connectors-oauth-heading" role="group" className="space-y-3">
        <h3 id="gtm-connectors-oauth-heading" className="text-sm font-medium text-bolt-elements-textPrimary">
          Needs vendor sign-in (not available yet)
        </h3>
        <ul className="divide-y divide-bolt-elements-borderColor rounded-lg border border-bolt-elements-borderColor">
          {OAUTH_CONNECTORS.map((connector) => (
            <li key={connector.id} className="space-y-1 px-4 py-3">
              <p className="text-sm text-bolt-elements-textPrimary">
                <span className="font-semibold">{connector.name}</span>
                <span className="text-xs text-bolt-elements-textTertiary">
                  {' '}
                  · {getGtmConnectorCategoryLabel(connector.category)}
                </span>
              </p>
              <p className="text-xs text-bolt-elements-textSecondary">{connector.description}</p>
              <p className="text-xs text-bolt-elements-textSecondary">{getOAuthWorkaround(connector)}</p>
              <DocsLink connector={connector} />
            </li>
          ))}
        </ul>
      </div>

      {dialogConnector && (
        <CredentialDialog
          key={dialogConnector.id}
          connector={dialogConnector}
          onClose={() => setDialogConnector(null)}
        />
      )}
    </section>
  );
}
