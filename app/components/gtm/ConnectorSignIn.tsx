import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'react-toastify';
import { AccessBadge, DocsLink, PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from './ConnectorParts';
import { Switch } from '~/components/ui/Switch';
import { BRAND } from '~/lib/brand';
import { disconnectVendor, fetchSignInStatus, onSignInMessage, startVendorSignIn } from '~/lib/gtm/connector-sign-in';
import {
  GTM_SIGN_IN_CONNECTORS,
  getGtmConnectorCategoryLabel,
  getOAuthWorkaround,
  getSignInConnector,
  type GtmSignInConnector,
} from '~/lib/gtm/connectors';
import { describeSignInResult, type SignInConnectorStatus, type SignInStatusResponse } from '~/lib/gtm/sign-in-result';
import { useMCPStore } from '~/lib/stores/mcp';

export const SIGN_IN_NOTICE = `Vendor sign-ins are kept in this ${BRAND.name} server's memory and tied to this browser by a cookie. Tokens are not saved in the browser or in settings exports, and other people using this server cannot use your sign-in. Restarting the server signs you out.`;

const SELECT_CLASS =
  'rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 py-1.5 text-sm text-bolt-elements-textPrimary outline-none focus-visible:ring-2 focus-visible:ring-bolt-elements-borderColorActive disabled:opacity-50';

type ToolLike = { metadata?: { annotations?: { readOnlyHint?: unknown } } } | undefined;

/** True when the vendor marks the tool as read-only (MCP `readOnlyHint`). A hint, not a guarantee. */
function isMarkedReadOnly(tool: unknown): boolean {
  return (tool as ToolLike)?.metadata?.annotations?.readOnlyHint === true;
}

/** On and off switches for a connected server's tools, saved with the other MCP tool settings. */
function ConnectorTools({ connector }: { connector: GtmSignInConnector }) {
  const server = useMCPStore((state) => state.serverTools[connector.id]);
  const toolEnabled = useMCPStore((state) => state.settings.toolEnabled);
  const setToolEnabled = useMCPStore((state) => state.setToolEnabled);
  const isInitialized = useMCPStore((state) => state.isInitialized);
  const loadError = useMCPStore((state) => state.error);

  if (!server) {
    return null;
  }

  if (server.status !== 'available') {
    return <p className="text-xs text-bolt-elements-icon-error">{server.error}</p>;
  }

  const tools = Object.entries(server.tools);
  const isOn = (name: string) => toolEnabled?.[name] !== false;
  const changeable = tools.filter(([name, tool]) => isOn(name) && !isMarkedReadOnly(tool)).map(([name]) => name);

  // Saving before the settings load would overwrite them with defaults.
  const locked = !isInitialized || Boolean(loadError);

  return (
    <details className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1">
      <summary className="cursor-pointer px-3 py-2 text-xs text-bolt-elements-textSecondary">
        Tools: {tools.filter(([name]) => isOn(name)).length} of {tools.length} on
      </summary>
      <div className="space-y-2 px-3 pb-3">
        {connector.signIn.access === 'read-write' && changeable.length > 0 && (
          <button
            type="button"
            disabled={locked}
            onClick={() => changeable.forEach((name) => setToolEnabled(name, false))}
            className={SECONDARY_BUTTON_CLASS}
          >
            Turn off {changeable.length} tools not marked read-only
          </button>
        )}
        <ul className="space-y-1.5">
          {tools.map(([name, tool]) => (
            <li key={name} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-xs text-bolt-elements-textPrimary">{name}</p>
                <p className="text-xs text-bolt-elements-textTertiary">
                  {isMarkedReadOnly(tool) ? `Marked read-only by ${connector.vendor}` : 'Not marked read-only'}
                </p>
              </div>
              <Switch
                checked={isOn(name)}
                disabled={locked}
                aria-label={`${isOn(name) ? 'Turn off' : 'Turn on'} ${name}`}
                onCheckedChange={(checked) => setToolEnabled(name, checked)}
                className="shrink-0"
              />
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

interface SignInCardProps {
  connector: GtmSignInConnector;
  loaded: boolean;
  status?: SignInConnectorStatus;
  redirectUri: string | null;
  variant: string;
  busy: boolean;
  waiting: boolean;
  onVariantChange: (value: string) => void;
  onSignIn: () => void;
  onDisconnect: () => void;
  onStopWaiting: () => void;
}

function SignInCard(props: SignInCardProps) {
  const { connector, loaded, status, redirectUri, variant, busy, waiting } = props;
  const { signIn } = connector;
  const state = status?.state ?? 'not-connected';
  const connectedVariant = signIn.variants.find((option) => option.value === status?.variant);

  const disconnectButton = (
    <button
      type="button"
      onClick={props.onDisconnect}
      disabled={busy}
      aria-label={`Disconnect ${connector.name}`}
      className={SECONDARY_BUTTON_CLASS}
    >
      {busy ? 'Disconnecting…' : 'Disconnect'}
    </button>
  );

  let actions: ReactNode = null;

  if (!loaded) {
    actions = <span className="text-xs text-bolt-elements-textTertiary">Checking sign-in…</span>;
  } else if (!status) {
    actions = null;
  } else if (waiting) {
    actions = (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-bolt-elements-textSecondary">
          Finish signing in to {connector.vendor} in the pop-up window.
        </span>
        <button type="button" onClick={props.onStopWaiting} className={SECONDARY_BUTTON_CLASS}>
          Cancel
        </button>
      </div>
    );
  } else if (state === 'connected') {
    actions = (
      <div className="flex shrink-0 items-center gap-3">
        <span className="flex items-center gap-1 text-xs text-bolt-elements-icon-success">
          <span className="i-ph:check-circle h-4 w-4" aria-hidden="true" />
          Connected{signIn.variants.length > 1 && connectedVariant ? ` (${connectedVariant.label})` : ''}
        </span>
        {disconnectButton}
      </div>
    );
  } else {
    actions = (
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {state === 'needs-sign-in' && (
          <span className="flex items-center gap-1 text-xs text-bolt-elements-textSecondary">
            <span className="i-ph:warning-circle h-4 w-4" aria-hidden="true" />
            Sign-in expired
          </span>
        )}
        {status.configured ? (
          <>
            {signIn.variants.length > 1 && (
              <select
                aria-label={`${connector.vendor} environment`}
                value={variant}
                onChange={(event) => props.onVariantChange(event.target.value)}
                disabled={busy}
                className={SELECT_CLASS}
              >
                {signIn.variants.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={props.onSignIn}
              disabled={busy}
              aria-label={`Sign in to ${connector.vendor}`}
              className={PRIMARY_BUTTON_CLASS}
            >
              {busy ? 'Opening…' : state === 'needs-sign-in' ? 'Sign in again' : 'Sign in'}
            </button>
          </>
        ) : (
          <span className="text-xs text-bolt-elements-textSecondary">Not set up on this server</span>
        )}
        {state === 'needs-sign-in' && disconnectButton}
      </div>
    );
  }

  return (
    <li className="space-y-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-bolt-elements-textPrimary">{connector.name}</h4>
            <AccessBadge access={signIn.access} />
          </div>
          <p className="text-xs text-bolt-elements-textTertiary">
            {connector.vendor} · {getGtmConnectorCategoryLabel(connector.category)}
          </p>
          <p className="mt-1 text-sm text-bolt-elements-textSecondary">{connector.description}</p>
          <div className="mt-1.5">
            <DocsLink connector={connector} />
          </div>
        </div>
        {actions}
      </div>
      <p className="text-xs text-bolt-elements-textSecondary">{signIn.note}</p>
      {status && !status.configured && (
        <div className="space-y-1.5 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-3 text-xs text-bolt-elements-textSecondary">
          <p>{signIn.setup}</p>
          <p>
            Callback URL:{' '}
            {redirectUri ? (
              <code className="break-all text-bolt-elements-textPrimary">{redirectUri}</code>
            ) : (
              'not available at this address. Serve this server over HTTPS or open it on localhost.'
            )}
          </p>
          <p>{getOAuthWorkaround(connector)}</p>
        </div>
      )}
      {state === 'connected' && !waiting && <ConnectorTools connector={connector} />}
      <p className="text-xs text-bolt-elements-textTertiary">
        Sign-in endpoints checked against the {connector.vendor} documentation and the server's published metadata on{' '}
        <span className="whitespace-nowrap">{connector.verifiedOn}</span>.
      </p>
    </li>
  );
}

/** The catalog entries that connect through the vendor's own sign-in. */
export default function ConnectorSignIn() {
  const serverTools = useMCPStore((state) => state.serverTools);
  const isInitialized = useMCPStore((state) => state.isInitialized);

  const [status, setStatus] = useState<SignInStatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [waitingId, setWaitingId] = useState<string | null>(null);
  const [variants, setVariants] = useState<Record<string, string>>({});
  const syncedServers = useRef(false);

  const loadStatus = useCallback(async () => {
    try {
      const next = await fetchSignInStatus();

      setStatus(next);
      setStatusError(null);

      return next;
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : 'Sign-in status is unavailable.');
      return null;
    }
  }, []);

  /** Re-reads every MCP server, so a signed-in server and its tools show up in the lists. */
  const refreshServers = useCallback(() => {
    useMCPStore
      .getState()
      .checkServersAvailabilities()
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(
    () =>
      onSignInMessage((message) => {
        const connector = getSignInConnector(message.connectorId);

        setWaitingId(null);
        void loadStatus();

        if (message.result === 'connected') {
          toast.success(`${connector?.name ?? 'The connector'} is connected.`);
          refreshServers();
        } else {
          toast.error(describeSignInResult(message.result, connector?.vendor ?? 'The vendor', BRAND.name));
        }
      }),
    [loadStatus, refreshServers],
  );

  // The pop-up reports through a BroadcastChannel; checking again on focus covers a browser where that fails.
  useEffect(() => {
    if (!waitingId) {
      return undefined;
    }

    const onFocus = () => {
      void loadStatus().then((next) => {
        if (next?.connectors[waitingId]?.state === 'connected') {
          setWaitingId(null);
          refreshServers();
        }
      });
    };

    window.addEventListener('focus', onFocus);

    return () => window.removeEventListener('focus', onFocus);
  }, [waitingId, loadStatus, refreshServers]);

  // After a reload the server list may not include signed-in servers yet.
  useEffect(() => {
    if (!status || !isInitialized || syncedServers.current) {
      return;
    }

    const missing = GTM_SIGN_IN_CONNECTORS.some(
      (connector) => status.connectors[connector.id]?.state === 'connected' && !serverTools[connector.id],
    );

    if (missing) {
      syncedServers.current = true;
      refreshServers();
    }
  }, [status, isInitialized, serverTools, refreshServers]);

  const signIn = async (connector: GtmSignInConnector) => {
    setBusyId(connector.id);

    try {
      const mode = await startVendorSignIn(connector.id, variants[connector.id] ?? connector.signIn.variants[0].value);

      if (mode === 'popup') {
        setWaitingId(connector.id);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `${connector.vendor} sign-in could not start.`);
    } finally {
      setBusyId(null);
    }
  };

  const disconnect = async (connector: GtmSignInConnector) => {
    setBusyId(connector.id);

    try {
      await disconnectVendor(connector.id);
      toast.info(`${connector.name} was disconnected.`);
      await loadStatus();
      refreshServers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `${connector.name} could not be disconnected.`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div aria-labelledby="gtm-connectors-sign-in-heading" role="group" className="space-y-3">
      <h3 id="gtm-connectors-sign-in-heading" className="text-sm font-medium text-bolt-elements-textPrimary">
        Sign in with the vendor
      </h3>
      <p className="text-xs text-bolt-elements-textSecondary">{SIGN_IN_NOTICE}</p>
      {statusError && (
        <p role="alert" className="text-sm text-bolt-elements-icon-error">
          {statusError}
        </p>
      )}
      <ul className="space-y-2">
        {GTM_SIGN_IN_CONNECTORS.map((connector) => (
          <SignInCard
            key={connector.id}
            connector={connector}
            loaded={status !== null || statusError !== null}
            status={status?.connectors[connector.id]}
            redirectUri={status?.redirectUri ?? null}
            variant={variants[connector.id] ?? connector.signIn.variants[0].value}
            busy={busyId === connector.id}
            waiting={waitingId === connector.id}
            onVariantChange={(value) => setVariants((current) => ({ ...current, [connector.id]: value }))}
            onSignIn={() => void signIn(connector)}
            onDisconnect={() => void disconnect(connector)}
            onStopWaiting={() => setWaitingId(null)}
          />
        ))}
      </ul>
    </div>
  );
}
