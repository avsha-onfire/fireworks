import { refreshAuthorization } from '@modelcontextprotocol/sdk/client/auth.js';
import {
  InvalidClientError,
  InvalidGrantError,
  UnauthorizedClientError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { FetchLike } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { ClientCredentials } from './config';
import { describeForLog, McpOAuthError } from './errors';
import { defaultFetch, toStoredTokens } from './flow';
import type { OAuthConnection, OAuthSessionStore } from './store';
import { getSignInConnector } from '~/lib/gtm/connectors';
import { createScopedLogger } from '~/utils/logger';

/*
 * Access tokens for one session's connection, refreshed on the server.
 *
 * A refresh runs at most once at a time per connection. Vendors that rotate
 * refresh tokens (Salesforce can) accept each one once, so two requests
 * refreshing in parallel would otherwise sign the user out.
 */

const logger = createScopedLogger('mcp-oauth');

/** Refresh this long before the vendor's stated expiry. */
export const REFRESH_MARGIN_MS = 60_000;

export interface TokenContext {
  store: OAuthSessionStore;
  sessionId: string;
  connectorId: string;
  credentials?: ClientCredentials;
  fetchFn?: FetchLike;
  now?: () => number;
}

const inflight = new Map<string, Promise<string>>();

function vendorOf(connectorId: string): string {
  return getSignInConnector(connectorId)?.vendor ?? 'The vendor';
}

function needsSignIn(connectorId: string): McpOAuthError {
  return new McpOAuthError('needs-sign-in', `Sign in to ${vendorOf(connectorId)} again in Settings, Data connectors.`, {
    status: 401,
    connectorId,
  });
}

function liveTokens(connection: OAuthConnection | undefined) {
  return connection?.status === 'connected' ? connection.tokens : undefined;
}

/** Drops the tokens and keeps the entry, so the settings can offer to sign in again. */
function markNeedsSignIn(context: TokenContext, signInId: string): void {
  const connection = context.store.getConnection(context.sessionId, context.connectorId);

  if (connection?.signInId === signInId) {
    connection.status = 'needs-sign-in';
    connection.tokens = undefined;
  }
}

/** The access token to send now, refreshed first when it is about to expire. */
export async function getAccessToken(context: TokenContext): Promise<string> {
  const tokens = liveTokens(context.store.getConnection(context.sessionId, context.connectorId));

  if (!tokens) {
    throw needsSignIn(context.connectorId);
  }

  const now = (context.now ?? Date.now)();

  if (tokens.refreshToken && tokens.expiresAt !== undefined && now >= tokens.expiresAt - REFRESH_MARGIN_MS) {
    return refreshAccessToken(context, tokens.accessToken);
  }

  return tokens.accessToken;
}

/**
 * Replaces `rejected` with a fresh access token. When another request has
 * already replaced it, that token is returned without asking the vendor again.
 */
export function refreshAccessToken(context: TokenContext, rejected: string): Promise<string> {
  const key = `${context.sessionId}\n${context.connectorId}`;
  const running = inflight.get(key);

  if (running) {
    return running;
  }

  const refresh = runRefresh(context, rejected).finally(() => inflight.delete(key));

  inflight.set(key, refresh);

  return refresh;
}

async function runRefresh(context: TokenContext, rejected: string): Promise<string> {
  const connection = context.store.getConnection(context.sessionId, context.connectorId);
  const tokens = liveTokens(connection);

  if (!connection || !tokens) {
    throw needsSignIn(context.connectorId);
  }

  if (tokens.accessToken !== rejected) {
    return tokens.accessToken;
  }

  if (!tokens.refreshToken) {
    markNeedsSignIn(context, connection.signInId);
    throw needsSignIn(context.connectorId);
  }

  if (!context.credentials) {
    throw new McpOAuthError(
      'not-configured',
      `${vendorOf(context.connectorId)} sign-in is not set up on this server.`,
      {
        status: 409,
        connectorId: context.connectorId,
      },
    );
  }

  const { clientId, clientSecret } = context.credentials;

  let refreshed;

  try {
    refreshed = await refreshAuthorization(connection.authorizationServerUrl, {
      metadata: connection.metadata,
      clientInformation: { client_id: clientId, client_secret: clientSecret },
      refreshToken: tokens.refreshToken,
      resource: connection.resource,
      fetchFn: context.fetchFn ?? defaultFetch,
    });
  } catch (error) {
    const secrets = [tokens.accessToken, tokens.refreshToken, clientSecret];

    const revoked =
      error instanceof InvalidGrantError ||
      error instanceof InvalidClientError ||
      error instanceof UnauthorizedClientError;

    logger.warn(
      `${context.connectorId}: token refresh failed${revoked ? ', sign-in needed' : ''}: ${describeForLog(error, secrets)}`,
    );

    if (revoked) {
      markNeedsSignIn(context, connection.signInId);
      throw needsSignIn(context.connectorId);
    }

    throw new McpOAuthError(
      'refresh-failed',
      `${vendorOf(context.connectorId)} did not renew the sign-in. Try again in a moment.`,
      { status: 502, connectorId: context.connectorId },
    );
  }

  const current = context.store.getConnection(context.sessionId, context.connectorId);
  const currentTokens = liveTokens(current);

  // A disconnect or a new sign-in while the refresh ran wins over its result.
  if (!current || !currentTokens) {
    throw needsSignIn(context.connectorId);
  }

  if (current.signInId !== connection.signInId) {
    return currentTokens.accessToken;
  }

  current.tokens = toStoredTokens(refreshed, (context.now ?? Date.now)());

  return current.tokens.accessToken;
}
