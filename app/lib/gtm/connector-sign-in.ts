import {
  isSignInResult,
  SIGN_IN_CHANNEL,
  SIGN_IN_MESSAGE_TYPE,
  type SignInMessage,
  type SignInStatusResponse,
} from './sign-in-result';

/*
 * Browser side of a vendor sign-in. The server runs the OAuth flow and keeps
 * the tokens; the browser only opens the vendor's page and reads the status.
 */

const POPUP_NAME = 'mcp-oauth-sign-in';
const POPUP_FEATURES = 'popup,width=520,height=720';

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown; message?: unknown };

    if (typeof body.error === 'string') {
      return body.error;
    }

    if (typeof body.message === 'string') {
      return body.message;
    }
  } catch {
    // Not JSON: the fallback says enough.
  }

  return fallback;
}

function postJson(path: string, body: unknown): Promise<Response> {
  return fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function fetchSignInStatus(): Promise<SignInStatusResponse> {
  const response = await fetch('/api/mcp-oauth/status', { cache: 'no-store' });

  if (!response.ok) {
    throw new Error(await readError(response, `Sign-in status is unavailable (${response.status}).`));
  }

  return (await response.json()) as SignInStatusResponse;
}

/**
 * Starts a vendor sign-in. The pop-up is opened before the request, while the
 * click still counts as a user action, and is pointed at the vendor once the
 * server returns the URL. When pop-ups are blocked, this tab goes to the
 * vendor instead and the callback page links back.
 */
export async function startVendorSignIn(connectorId: string, variant: string): Promise<'popup' | 'redirect'> {
  const popup = window.open('', POPUP_NAME, POPUP_FEATURES);

  try {
    const response = await postJson('/api/mcp-oauth/start', { connectorId, variant });

    if (!response.ok) {
      throw new Error(await readError(response, `Sign-in could not start (${response.status}).`));
    }

    const { authorizationUrl } = (await response.json()) as { authorizationUrl?: unknown };

    if (typeof authorizationUrl !== 'string' || !authorizationUrl.startsWith('https://')) {
      throw new Error('Sign-in could not start.');
    }

    if (popup && !popup.closed) {
      // The vendor's page does not need a handle on this window.
      popup.opener = null;
      popup.location.href = authorizationUrl;

      return 'popup';
    }

    window.location.assign(authorizationUrl);

    return 'redirect';
  } catch (error) {
    popup?.close();
    throw error;
  }
}

export async function disconnectVendor(connectorId: string): Promise<void> {
  const response = await postJson('/api/mcp-oauth/disconnect', { connectorId });

  if (!response.ok) {
    throw new Error(await readError(response, `Could not disconnect (${response.status}).`));
  }
}

/** Calls `listener` when a callback page in this browser reports a result. Returns the unsubscribe function. */
export function onSignInMessage(listener: (message: SignInMessage) => void): () => void {
  if (typeof BroadcastChannel === 'undefined') {
    return () => undefined;
  }

  const channel = new BroadcastChannel(SIGN_IN_CHANNEL);

  channel.onmessage = (event: MessageEvent) => {
    const data = event.data as Partial<SignInMessage> | null;

    if (data?.type === SIGN_IN_MESSAGE_TYPE && isSignInResult(data.result)) {
      listener({
        type: SIGN_IN_MESSAGE_TYPE,
        connectorId: typeof data.connectorId === 'string' ? data.connectorId : null,
        result: data.result,
      });
    }
  };

  return () => channel.close();
}
