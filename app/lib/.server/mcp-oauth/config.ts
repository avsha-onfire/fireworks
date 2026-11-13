import { McpOAuthError } from './errors';
import type { GtmSignInConnector } from '~/lib/gtm/connectors';

export type ServerEnv = Record<string, unknown> | undefined;

/** The Workers bindings in a route's context. The desktop app has none and uses `process.env`. */
export function getServerEnv(context: unknown): ServerEnv {
  const env = (context as { cloudflare?: { env?: unknown } } | undefined)?.cloudflare?.env;

  return typeof env === 'object' && env !== null ? (env as Record<string, unknown>) : undefined;
}

/** A trimmed, non-empty setting from the bindings, else from `process.env`. */
export function readEnv(env: ServerEnv, name: string): string | undefined {
  const bound = env?.[name];
  const raw = typeof bound === 'string' ? bound : globalThis.process?.env?.[name];
  const value = raw?.trim();

  return value ? value : undefined;
}

export interface ClientCredentials {
  clientId: string;
  clientSecret?: string;
}

/** This deployment's app credentials for the vendor, or undefined until an administrator sets them. */
export function readClientCredentials(connector: GtmSignInConnector, env: ServerEnv): ClientCredentials | undefined {
  const clientId = readEnv(env, connector.signIn.clientIdEnv);
  const clientSecret = readEnv(env, connector.signIn.clientSecretEnv);

  if (!clientId || (connector.signIn.clientSecretRequired && !clientSecret)) {
    return undefined;
  }

  return { clientId, clientSecret };
}

export const CALLBACK_PATH = '/api/mcp-oauth/callback';
export const REDIRECT_URI_ENV = 'MCP_OAUTH_REDIRECT_URI';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * The callback URL registered with the vendor: `MCP_OAUTH_REDIRECT_URI` when
 * set (for a server behind a proxy), else this server's own address. The MCP
 * authorization spec allows only HTTPS or localhost redirect URIs.
 */
export function getRedirectUri(request: Request, env: ServerEnv): string {
  const configured = readEnv(env, REDIRECT_URI_ENV);

  let uri: URL;

  try {
    uri = new URL(configured ?? CALLBACK_PATH, request.url);
  } catch {
    throw new McpOAuthError('insecure-redirect', `${REDIRECT_URI_ENV} is not a valid URL.`, { status: 500 });
  }

  const isLoopback = uri.protocol === 'http:' && LOOPBACK_HOSTS.has(uri.hostname);

  if (uri.protocol !== 'https:' && !isLoopback) {
    throw new McpOAuthError(
      'insecure-redirect',
      `Vendor sign-in needs this server on HTTPS or on localhost. Behind an HTTPS proxy, set ${REDIRECT_URI_ENV} to the public callback URL.`,
      { status: 400 },
    );
  }

  if (!uri.pathname.endsWith(CALLBACK_PATH) || uri.search || uri.hash || uri.username || uri.password) {
    throw new McpOAuthError(
      'insecure-redirect',
      `${REDIRECT_URI_ENV} must end with ${CALLBACK_PATH}, with no query or credentials.`,
      { status: 500 },
    );
  }

  return uri.href;
}
