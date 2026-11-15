import { redactErrorText } from '~/lib/services/mcpRedaction';

export type McpOAuthErrorCode =
  | 'unknown-connector'
  | 'not-configured'
  | 'insecure-redirect'
  | 'discovery-failed'
  | 'untrusted-metadata'
  | 'expired'
  | 'wrong-browser'
  | 'denied'
  | 'exchange-failed'
  | 'needs-sign-in'
  | 'refresh-failed';

/**
 * A sign-in error whose message is written here and is safe to show. What the
 * vendor said is logged where it happens, through `describeForLog`, and is
 * never attached, so nothing that catches this error can leak it.
 */
export class McpOAuthError extends Error {
  readonly code: McpOAuthErrorCode;
  readonly status: number;
  readonly connectorId?: string;

  constructor(code: McpOAuthErrorCode, message: string, options: { status?: number; connectorId?: string } = {}) {
    super(message);
    this.name = 'McpOAuthError';
    this.code = code;
    this.status = options.status ?? 400;
    this.connectorId = options.connectorId;
  }
}

/**
 * The error's message, and its cause's, for a log line. Every value in
 * `secrets` (tokens, the authorization code, the PKCE verifier, the client
 * secret) is masked wherever it occurs, as are query values in URLs.
 */
export function describeForLog(error: unknown, secrets: Array<string | undefined> = []): string {
  const headers = Object.fromEntries(
    secrets.filter((secret): secret is string => Boolean(secret)).map((secret, index) => [String(index), secret]),
  );

  return redactErrorText(error, { headers });
}
