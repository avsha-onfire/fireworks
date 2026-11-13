/*
 * What the server and the settings tab share about a vendor sign-in. No
 * browser or server APIs here, so both sides can import it.
 */

/** BroadcastChannel the callback page uses to tell the settings tab how a sign-in ended. */
export const SIGN_IN_CHANNEL = 'mcp-oauth';
export const SIGN_IN_MESSAGE_TYPE = 'mcp-oauth-result';

export const SIGN_IN_RESULTS = [
  'connected',
  'cancelled',
  'expired',
  'wrong-browser',
  'not-configured',
  'failed',
] as const;

export type SignInResult = (typeof SIGN_IN_RESULTS)[number];

export function isSignInResult(value: unknown): value is SignInResult {
  return typeof value === 'string' && (SIGN_IN_RESULTS as readonly string[]).includes(value);
}

export interface SignInMessage {
  type: typeof SIGN_IN_MESSAGE_TYPE;
  connectorId: string | null;
  result: SignInResult;
}

/** The outcome in plain words, for the callback page and the settings tab. */
export function describeSignInResult(result: SignInResult, vendor: string, product: string): string {
  switch (result) {
    case 'connected':
      return `${vendor} is connected. You can close this window and return to ${product}.`;
    case 'cancelled':
      return `${vendor} sign-in was cancelled or refused. Nothing was connected.`;
    case 'expired':
      return 'This sign-in link expired or was already used. Start again from Settings, Data connectors.';
    case 'wrong-browser':
      return `This sign-in was started in another browser, so it was not completed here. Start it again in the browser you use with ${product}.`;
    case 'not-configured':
      return `${vendor} sign-in is not set up on this server.`;
    default:
      return `${vendor} sign-in did not complete. Try again from Settings, Data connectors.`;
  }
}

export type SignInState = 'not-connected' | 'connected' | 'needs-sign-in';

export interface SignInConnectorStatus {
  /** True when this server has app credentials for the vendor. */
  configured: boolean;
  state: SignInState;
  variant: string | null;
  connectedAt: string | null;
}

/** GET /api/mcp-oauth/status: this browser's sign-ins. Never carries a token. */
export interface SignInStatusResponse {
  /** The callback URL to register with the vendor, or null when this address cannot be used. */
  redirectUri: string | null;
  connectors: Record<string, SignInConnectorStatus>;
}
