import {
  discoverOAuthServerInfo,
  exchangeAuthorization,
  startAuthorization,
} from '@modelcontextprotocol/sdk/client/auth.js';
import { checkResourceAllowed } from '@modelcontextprotocol/sdk/shared/auth-utils.js';
import type { OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { FetchLike } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { ClientCredentials } from './config';
import { describeForLog, McpOAuthError } from './errors';
import { randomToken, type ConnectionTarget, type OAuthSessionStore, type StoredTokens } from './store';
import { getSignInConnector, type GtmSignInConnector, type GtmSignInVariant } from '~/lib/gtm/connectors';
import { createScopedLogger } from '~/utils/logger';

/*
 * The authorization code flow with PKCE, built on the MCP SDK's client auth
 * functions. Discovery follows the MCP authorization spec (protected resource
 * metadata, then authorization server metadata), and its result is accepted
 * only when it matches what the vendor documents.
 *
 * A vendor's error is logged here, redacted, and never attached to the error
 * that is thrown, so no caller can log or return it unmasked.
 */

const logger = createScopedLogger('mcp-oauth');

export interface FlowOptions {
  fetchFn?: FetchLike;
  now?: () => number;
}

export const defaultFetch: FetchLike = (url, init) => fetch(url, init);

function normalizeUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const href = new URL(value).href;

    return href.endsWith('/') ? href.slice(0, -1) : href;
  } catch {
    return undefined;
  }
}

function sameUrl(actual: string | undefined, expected: string): boolean {
  const normalized = normalizeUrl(actual);

  return normalized !== undefined && normalized === normalizeUrl(expected);
}

function isHttpsOn(url: string | undefined, origin: string): boolean {
  try {
    const parsed = new URL(url ?? '');

    return parsed.protocol === 'https:' && parsed.origin === origin;
  } catch {
    return false;
  }
}

export interface DiscoveredTarget extends ConnectionTarget {
  scopesSupported?: string[];
}

/**
 * Runs discovery for one environment and checks it: the authorization server
 * must be the one the vendor documents, its endpoints must be HTTPS on that
 * origin, it must list PKCE S256 (the spec says to refuse otherwise), and the
 * protected resource must be the server being connected.
 */
export async function discoverTarget(
  connector: GtmSignInConnector,
  variant: GtmSignInVariant,
  options: FlowOptions = {},
): Promise<DiscoveredTarget> {
  let info: Awaited<ReturnType<typeof discoverOAuthServerInfo>>;

  try {
    info = await discoverOAuthServerInfo(variant.serverUrl, { fetchFn: options.fetchFn ?? defaultFetch });
  } catch (cause) {
    logger.warn(`${connector.id}: sign-in discovery failed: ${describeForLog(cause)}`);
    throw new McpOAuthError(
      'discovery-failed',
      `${connector.vendor} did not answer the sign-in discovery request. Try again in a moment.`,
      { status: 502, connectorId: connector.id },
    );
  }

  const stop = (detail: string) => {
    logger.warn(`${connector.id}: sign-in stopped, metadata check failed: ${detail}`);

    return new McpOAuthError(
      'untrusted-metadata',
      `${connector.vendor}'s sign-in metadata does not match its documentation (${detail}), so sign-in was stopped.`,
      { status: 502, connectorId: connector.id },
    );
  };

  const { resourceMetadata, authorizationServerUrl, authorizationServerMetadata: metadata } = info;
  const origin = new URL(variant.authorizationServer).origin;

  if (!resourceMetadata) {
    throw stop('no protected resource metadata');
  }

  if (!sameUrl(authorizationServerUrl, variant.authorizationServer)) {
    throw stop('unexpected authorization server');
  }

  if (!metadata) {
    throw stop('no authorization server metadata');
  }

  if (!sameUrl(metadata.issuer, variant.authorizationServer)) {
    throw stop('unexpected issuer');
  }

  if (!isHttpsOn(metadata.authorization_endpoint, origin) || !isHttpsOn(metadata.token_endpoint, origin)) {
    throw stop('endpoints on another host');
  }

  if (!metadata.code_challenge_methods_supported?.includes('S256')) {
    throw stop('no PKCE S256');
  }

  let resourceMatches = false;

  try {
    resourceMatches = checkResourceAllowed({
      requestedResource: variant.serverUrl,
      configuredResource: resourceMetadata.resource,
    });
  } catch {
    // An unparseable resource is a mismatch.
  }

  if (!resourceMatches) {
    throw stop('resource does not match the server');
  }

  return {
    connectorId: connector.id,
    variant: variant.value,
    serverUrl: variant.serverUrl,
    resource: resourceMetadata.resource,
    authorizationServerUrl: variant.authorizationServer,
    metadata,
    scopesSupported: resourceMetadata.scopes_supported,
  };
}

/**
 * The scope to request: the vendor's documented scopes when the catalog names
 * them, otherwise the spec's fallback, every scope in the protected resource
 * metadata. An empty list means no `scope` parameter at all.
 */
export function selectScope(connector: GtmSignInConnector, scopesSupported?: string[]): string | undefined {
  const scopes = connector.signIn.scopes ?? scopesSupported ?? [];

  return scopes.length > 0 ? scopes.join(' ') : undefined;
}

export function toStoredTokens(tokens: OAuthTokens, now: number): StoredTokens {
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: tokens.expires_in !== undefined && tokens.expires_in > 0 ? now + tokens.expires_in * 1000 : undefined,
  };
}

export interface StartSignInParams {
  store: OAuthSessionStore;
  sessionId: string;
  connector: GtmSignInConnector;
  variant: GtmSignInVariant;
  credentials: ClientCredentials;
  redirectUri: string;
  options?: FlowOptions;
}

/**
 * Starts a sign-in and returns the vendor's authorization URL. The PKCE
 * verifier stays in the store, under a single-use `state` bound to the session.
 */
export async function startSignIn(params: StartSignInParams): Promise<string> {
  const { store, sessionId, connector, variant, credentials, redirectUri, options } = params;
  const { scopesSupported, ...target } = await discoverTarget(connector, variant, options);
  const state = randomToken();

  const { authorizationUrl, codeVerifier } = await startAuthorization(target.authorizationServerUrl, {
    metadata: target.metadata,
    clientInformation: { client_id: credentials.clientId },
    redirectUrl: redirectUri,
    scope: selectScope(connector, scopesSupported),
    state,
    resource: target.resource,
  });

  store.addPending(state, { ...target, sessionId, clientId: credentials.clientId, redirectUri, codeVerifier });

  return authorizationUrl.href;
}

export interface CompleteSignInParams {
  store: OAuthSessionStore;

  /** The session id from the callback request's cookie. */
  sessionId: string | undefined;
  state: string;
  code?: string;

  /** The `error` parameter the vendor sent instead of a code. */
  error?: string;
  credentialsFor: (connector: GtmSignInConnector) => ClientCredentials | undefined;
  options?: FlowOptions;
}

/**
 * Finishes a sign-in at the callback: exchanges the code and stores the
 * tokens on the session that started it. The callback must arrive with that
 * session's cookie. Otherwise a sign-in link started by someone else could
 * attach the account that approves it to their session.
 */
export async function completeSignIn(params: CompleteSignInParams): Promise<{ connectorId: string }> {
  const { store, sessionId, state, code, error, credentialsFor, options } = params;
  const flow = store.takePending(state);
  const connector = flow ? getSignInConnector(flow.connectorId) : undefined;

  if (!flow || !connector) {
    throw new McpOAuthError('expired', 'This sign-in link expired or was already used. Start again from Settings.');
  }

  const connectorId = connector.id;

  if (!sessionId || sessionId !== flow.sessionId || !store.getSession(sessionId)) {
    throw new McpOAuthError(
      'wrong-browser',
      'This sign-in was started in another browser or session, so it was not completed here.',
      { status: 403, connectorId },
    );
  }

  if (error !== undefined || !code) {
    throw new McpOAuthError('denied', `${connector.vendor} sign-in was cancelled or refused. Nothing was connected.`, {
      connectorId,
    });
  }

  const credentials = credentialsFor(connector);

  if (!credentials || credentials.clientId !== flow.clientId) {
    throw new McpOAuthError('not-configured', `${connector.vendor} sign-in is not set up on this server.`, {
      status: 409,
      connectorId,
    });
  }

  const now = (options?.now ?? Date.now)();

  let tokens: OAuthTokens;

  try {
    tokens = await exchangeAuthorization(flow.authorizationServerUrl, {
      metadata: flow.metadata,
      clientInformation: { client_id: credentials.clientId, client_secret: credentials.clientSecret },
      authorizationCode: code,
      codeVerifier: flow.codeVerifier,
      redirectUri: flow.redirectUri,
      resource: flow.resource,
      fetchFn: options?.fetchFn ?? defaultFetch,
    });
  } catch (cause) {
    const secrets = [code, flow.codeVerifier, credentials.clientSecret];

    logger.warn(`${connectorId}: authorization code exchange failed: ${describeForLog(cause, secrets)}`);
    throw new McpOAuthError('exchange-failed', `${connector.vendor} did not accept the sign-in. Try again.`, {
      status: 502,
      connectorId,
    });
  }

  store.setConnection(sessionId, {
    connectorId,
    variant: flow.variant,
    serverUrl: flow.serverUrl,
    resource: flow.resource,
    authorizationServerUrl: flow.authorizationServerUrl,
    metadata: flow.metadata,
    status: 'connected',
    tokens: toStoredTokens(tokens, now),
    connectedAt: now,
    signInId: randomToken(),
  });

  return { connectorId };
}
