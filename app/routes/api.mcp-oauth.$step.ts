import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { readJsonBody } from '~/lib/.server/api/read-body';
import { CALLBACK_PATH, getRedirectUri, getServerEnv, readClientCredentials } from '~/lib/.server/mcp-oauth/config';
import { readSessionId, sessionCookieHeader } from '~/lib/.server/mcp-oauth/cookie';
import { describeForLog, McpOAuthError } from '~/lib/.server/mcp-oauth/errors';
import { completeSignIn, startSignIn } from '~/lib/.server/mcp-oauth/flow';
import { closeSessionClient } from '~/lib/.server/mcp-oauth/session-servers';
import { getOAuthStore } from '~/lib/.server/mcp-oauth/store';
import { BRAND } from '~/lib/brand';
import { GTM_SIGN_IN_CONNECTORS, getSignInConnector, getSignInVariant } from '~/lib/gtm/connectors';
import {
  describeSignInResult,
  isSignInResult,
  SIGN_IN_CHANNEL,
  SIGN_IN_MESSAGE_TYPE,
  type SignInResult,
  type SignInStatusResponse,
} from '~/lib/gtm/sign-in-result';
import { withSecurity } from '~/lib/security';
import { createScopedLogger } from '~/utils/logger';

/*
 * Vendor sign-in for MCP connectors (app/lib/.server/mcp-oauth/README.md).
 *
 *   POST /api/mcp-oauth/start       { connectorId, variant } -> { authorizationUrl }
 *   GET  /api/mcp-oauth/callback    the vendor's redirect; then the result page
 *   GET  /api/mcp-oauth/status      this browser's sign-ins
 *   POST /api/mcp-oauth/disconnect  { connectorId }
 *
 * No response carries a token, the authorization code, the PKCE verifier or
 * the client secret.
 */

const logger = createScopedLogger('api.mcp-oauth');

const NO_STORE = { 'Cache-Control': 'no-store' };
const MAX_BODY_BYTES = 2048;

export const loader = withSecurity(mcpOAuthLoader, { allowedMethods: ['GET'] });
export const action = withSecurity(mcpOAuthAction, { allowedMethods: ['POST'] });

function json(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);

  headers.set('Cache-Control', 'no-store');

  return Response.json(body, { ...init, headers });
}

function errorResponse(error: unknown, connectorId?: string): Response {
  if (error instanceof McpOAuthError) {
    return json({ error: error.message, code: error.code }, { status: error.status });
  }

  logger.error(`${connectorId ?? 'sign-in'}: unexpected error: ${describeForLog(error)}`);

  return json({ error: 'Sign-in failed on the server. Try again.' }, { status: 500 });
}

function isJsonRequest(request: Request): boolean {
  return request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() === 'application/json';
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const body = await readJsonBody(request, { maxBytes: MAX_BODY_BYTES });

  return typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

async function mcpOAuthAction({ request, params, context }: ActionFunctionArgs): Promise<Response> {
  /*
   * A page on another site can send a form or text/plain POST without a
   * preflight, and SameSite=Lax already keeps the session cookie off it.
   * Requiring JSON closes the door twice.
   */
  if (!isJsonRequest(request)) {
    return json({ error: 'Content-Type must be application/json' }, { status: 415 });
  }

  switch (params.step) {
    case 'start':
      return start(request, context);
    case 'disconnect':
      return disconnect(request);
    default:
      return json({ error: 'Not found' }, { status: 404 });
  }
}

async function mcpOAuthLoader({ request, params, context }: LoaderFunctionArgs): Promise<Response> {
  switch (params.step) {
    case 'callback':
      return callback(request, context);
    case 'status':
      return status(request, context);
    default:
      return json({ error: 'Not found' }, { status: 404 });
  }
}

async function start(request: Request, context: unknown): Promise<Response> {
  const body = await readBody(request);
  const connector = getSignInConnector(body.connectorId);

  if (!connector) {
    return json({ error: 'This connector cannot be connected by signing in.' }, { status: 404 });
  }

  const variant = getSignInVariant(connector, body.variant ?? undefined);

  if (!variant) {
    return json({ error: `Choose a ${connector.vendor} environment.` }, { status: 400 });
  }

  const env = getServerEnv(context);
  const credentials = readClientCredentials(connector, env);

  if (!credentials) {
    return json({ error: `${connector.vendor} sign-in is not set up on this server.` }, { status: 409 });
  }

  try {
    const redirectUri = getRedirectUri(request, env);
    const store = getOAuthStore();
    const headers = new Headers(NO_STORE);

    let session = store.getSession(readSessionId(request));

    if (!session) {
      session = store.createSession();
      headers.append('Set-Cookie', sessionCookieHeader(request, session.id));
    }

    const authorizationUrl = await startSignIn({
      store,
      sessionId: session.id,
      connector,
      variant,
      credentials,
      redirectUri,
    });

    logger.info(`${connector.id}: sign-in started`);

    return Response.json({ authorizationUrl }, { headers });
  } catch (error) {
    return errorResponse(error, connector.id);
  }
}

function resultFor(error: unknown): SignInResult {
  if (!(error instanceof McpOAuthError)) {
    return 'failed';
  }

  switch (error.code) {
    case 'denied':
      return 'cancelled';
    case 'expired':
    case 'wrong-browser':
    case 'not-configured':
      return error.code;
    default:
      return 'failed';
  }
}

async function callback(request: Request, context: unknown): Promise<Response> {
  const url = new URL(request.url);
  const state = url.searchParams.get('state');

  if (state === null) {
    return resultPage(url);
  }

  const env = getServerEnv(context);

  let result: SignInResult = 'connected';
  let connectorId: string | undefined;

  try {
    ({ connectorId } = await completeSignIn({
      store: getOAuthStore(),
      sessionId: readSessionId(request),
      state,
      code: url.searchParams.get('code') ?? undefined,
      error: url.searchParams.get('error') ?? undefined,
      credentialsFor: (connector) => readClientCredentials(connector, env),
    }));
    logger.info(`${connectorId}: signed in`);
  } catch (error) {
    result = resultFor(error);
    connectorId = error instanceof McpOAuthError ? error.connectorId : undefined;

    if (error instanceof McpOAuthError) {
      logger.warn(`${connectorId ?? 'sign-in'}: callback ended with "${result}"`);
    } else {
      logger.error(`sign-in callback failed: ${describeForLog(error, [url.searchParams.get('code') ?? undefined])}`);
    }
  }

  /*
   * Redirect to the same path without the code and state, so they leave the
   * address bar and the browser history as soon as they have been used.
   */
  const location = new URLSearchParams({ result });

  if (connectorId) {
    location.set('connector', connectorId);
  }

  return new Response(null, { status: 303, headers: { ...NO_STORE, Location: `${CALLBACK_PATH}?${location}` } });
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
}

/** The page the pop-up ends on. It reports the result to the settings tab and closes itself. */
function resultPage(url: URL): Response {
  const param = url.searchParams.get('result');
  const result: SignInResult = isSignInResult(param) ? param : 'failed';
  const connector = getSignInConnector(url.searchParams.get('connector'));
  const vendor = connector?.vendor ?? 'The vendor';
  const heading = result === 'connected' ? `${vendor} is connected` : `${vendor} is not connected`;
  const message = describeSignInResult(result, vendor, BRAND.name);

  const payload = JSON.stringify({
    type: SIGN_IN_MESSAGE_TYPE,
    connectorId: connector?.id ?? null,
    result,
  }).replace(/</g, '\\u003c');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(`${heading} | ${BRAND.name}`)}</title>
<style>body{font-family:system-ui,sans-serif;line-height:1.5;max-width:32rem;margin:15vh auto;padding:0 1rem;color:#1f2328}</style>
</head>
<body>
<h1>${escapeHtml(heading)}</h1>
<p>${escapeHtml(message)}</p>
<p><a href="/">Return to ${escapeHtml(BRAND.name)}</a></p>
<script>
(function () {
  var data = ${payload};
  try { var channel = new BroadcastChannel(${JSON.stringify(SIGN_IN_CHANNEL)}); channel.postMessage(data); channel.close(); } catch (e) {}
  if (data.result === 'connected') { setTimeout(function () { window.close(); }, 800); }
})();
</script>
</body>
</html>`;

  return new Response(html, { headers: { ...NO_STORE, 'Content-Type': 'text/html; charset=utf-8' } });
}

function status(request: Request, context: unknown): Response {
  const env = getServerEnv(context);
  const session = getOAuthStore().getSession(readSessionId(request));

  let redirectUri: string | null = null;

  try {
    redirectUri = getRedirectUri(request, env);
  } catch {
    // Shown as "not available" in the settings; the start request explains why.
  }

  const body: SignInStatusResponse = {
    redirectUri,
    connectors: Object.fromEntries(
      GTM_SIGN_IN_CONNECTORS.map((connector) => {
        const connection = session?.connections.get(connector.id);

        return [
          connector.id,
          {
            configured: readClientCredentials(connector, env) !== undefined,
            state: connection?.status ?? 'not-connected',
            variant: connection?.variant ?? null,
            connectedAt: connection ? new Date(connection.connectedAt).toISOString() : null,
          },
        ];
      }),
    ),
  };

  return json(body);
}

async function disconnect(request: Request): Promise<Response> {
  const body = await readBody(request);
  const connector = getSignInConnector(body.connectorId);

  if (!connector) {
    return json({ error: 'This connector cannot be connected by signing in.' }, { status: 404 });
  }

  const store = getOAuthStore();
  const session = store.getSession(readSessionId(request));

  if (!session) {
    return json({ disconnected: false });
  }

  const connection = store.deleteConnection(session.id, connector.id);

  closeSessionClient(session.id, connector.id);

  if (connection) {
    logger.info(`${connector.id}: disconnected`);
  }

  return json({ disconnected: connection !== undefined });
}
