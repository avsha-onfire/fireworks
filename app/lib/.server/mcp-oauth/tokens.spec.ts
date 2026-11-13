import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { McpOAuthError } from './errors';
import { createFakeVendor, type FakeVendor } from './fake-vendor.testing';
import { completeSignIn, startSignIn } from './flow';
import { OAuthSessionStore } from './store';
import { getAccessToken, refreshAccessToken, REFRESH_MARGIN_MS, type TokenContext } from './tokens';
import { getSignInConnector } from '~/lib/gtm/connectors';

const CREDENTIALS = { clientId: 'hubspot-client-id', clientSecret: 'hubspot-client-secret-9f3c' };
const hubspot = getSignInConnector('gtm-hubspot')!;

let logs: string[];

beforeEach(() => {
  logs = [];

  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** A session signed in to a fake HubSpot, with a clock the test controls. */
async function signedIn(options: { rotateRefreshTokens?: boolean } = {}) {
  const clock = { now: 1_700_000_000_000 };
  const store = new OAuthSessionStore(() => clock.now);
  const session = store.createSession();

  const vendor: FakeVendor = createFakeVendor({
    serverUrl: 'https://mcp.hubspot.com',
    authorizationServer: 'https://mcp.hubspot.com',
    clientId: CREDENTIALS.clientId,
    clientSecret: CREDENTIALS.clientSecret,
    accessTokenTtlSeconds: 1800,
    ...options,
  });

  const flow = { fetchFn: vendor.fetch, now: () => clock.now };

  const authorizationUrl = await startSignIn({
    store,
    sessionId: session.id,
    connector: hubspot,
    variant: hubspot.signIn.variants[0],
    credentials: CREDENTIALS,
    redirectUri: 'http://localhost:5173/api/mcp-oauth/callback',
    options: flow,
  });

  const callback = new URL(await vendor.approve(authorizationUrl));

  await completeSignIn({
    store,
    sessionId: session.id,
    state: callback.searchParams.get('state')!,
    code: callback.searchParams.get('code')!,
    credentialsFor: () => CREDENTIALS,
    options: flow,
  });

  const context: TokenContext = {
    store,
    sessionId: session.id,
    connectorId: 'gtm-hubspot',
    credentials: CREDENTIALS,
    fetchFn: vendor.fetch,
    now: () => clock.now,
  };

  const connection = () => store.getConnection(session.id, 'gtm-hubspot')!;

  return { clock, store, vendor, context, connection };
}

const refreshRequests = (vendor: FakeVendor) =>
  vendor.tokenRequests.filter((params) => params.get('grant_type') === 'refresh_token');

describe('getAccessToken', () => {
  it('returns the stored token while it is fresh', async () => {
    const { vendor, context, connection } = await signedIn();

    expect(await getAccessToken(context)).toBe(connection().tokens?.accessToken);
    expect(refreshRequests(vendor)).toHaveLength(0);
  });

  it(`refreshes ${REFRESH_MARGIN_MS / 1000} seconds before expiry, with the client secret and resource`, async () => {
    const { clock, vendor, context, connection } = await signedIn();
    const first = connection().tokens!;

    clock.now = first.expiresAt! - REFRESH_MARGIN_MS;

    const token = await getAccessToken(context);
    const [refresh] = refreshRequests(vendor);

    expect(token).not.toBe(first.accessToken);
    expect(connection().tokens?.accessToken).toBe(token);
    expect(connection().tokens?.expiresAt).toBe(clock.now + 1800 * 1000);
    expect(refresh.get('refresh_token')).toBe(first.refreshToken);
    expect(refresh.get('client_secret')).toBe(CREDENTIALS.clientSecret);
    expect(refresh.get('resource')).toBe('https://mcp.hubspot.com');
  });

  it('keeps a rotated refresh token, so the next refresh uses the new one', async () => {
    const { vendor, context, connection } = await signedIn({ rotateRefreshTokens: true });
    const first = connection().tokens!;

    await refreshAccessToken(context, first.accessToken);

    const second = connection().tokens!;

    expect(second.refreshToken).not.toBe(first.refreshToken);

    await refreshAccessToken(context, second.accessToken);

    expect(refreshRequests(vendor).map((params) => params.get('refresh_token'))).toEqual([
      first.refreshToken,
      second.refreshToken,
    ]);
    expect(connection().status).toBe('connected');
  });
});

describe('refreshAccessToken', () => {
  it('runs one refresh for parallel requests, so a rotated refresh token is presented once', async () => {
    const { vendor, context, connection } = await signedIn({ rotateRefreshTokens: true });
    const rejected = connection().tokens!.accessToken;

    const tokens = await Promise.all([1, 2, 3].map(() => refreshAccessToken(context, rejected)));

    expect(new Set(tokens).size).toBe(1);
    expect(refreshRequests(vendor)).toHaveLength(1);
    expect(connection().status).toBe('connected');
  });

  it('does not refresh again when another request already replaced the rejected token', async () => {
    const { vendor, context, connection } = await signedIn();
    const rejected = connection().tokens!.accessToken;
    const fresh = await refreshAccessToken(context, rejected);

    expect(await refreshAccessToken(context, rejected)).toBe(fresh);
    expect(refreshRequests(vendor)).toHaveLength(1);
  });

  it('asks the user to sign in again when the vendor refuses the refresh token', async () => {
    const { vendor, context, connection } = await signedIn();

    vendor.revokeRefreshTokens();

    const error = await refreshAccessToken(context, connection().tokens!.accessToken).catch((reason) => reason);

    expect(error).toBeInstanceOf(McpOAuthError);
    expect(error.code).toBe('needs-sign-in');
    expect(error.message).toBe('Sign in to HubSpot again in Settings, Data connectors.');
    expect(connection().status).toBe('needs-sign-in');
    expect(connection().tokens).toBeUndefined();
    await expect(getAccessToken(context)).rejects.toMatchObject({ code: 'needs-sign-in' });
  });

  it('keeps the sign-in when the vendor fails for a moment', async () => {
    const { vendor, context, connection } = await signedIn();
    const before = connection().tokens;

    vendor.failRefreshes(503);

    const error = await refreshAccessToken(context, before!.accessToken).catch((reason) => reason);

    expect(error).toMatchObject({ code: 'refresh-failed' });
    expect(connection().status).toBe('connected');
    expect(connection().tokens).toEqual(before);

    vendor.failRefreshes(undefined);

    expect(await refreshAccessToken(context, before!.accessToken)).not.toBe(before!.accessToken);
  });

  it('never logs a token or the client secret', async () => {
    const { vendor, context, connection } = await signedIn();

    vendor.failRefreshes(503);
    await refreshAccessToken(context, connection().tokens!.accessToken).catch(() => undefined);
    vendor.failRefreshes(undefined);
    vendor.revokeRefreshTokens();
    await refreshAccessToken(context, connection().tokens!.accessToken).catch(() => undefined);

    const logged = logs.join('\n');

    expect(logged).toContain('token refresh failed');

    for (const secret of vendor.secrets()) {
      expect(logged).not.toContain(secret);
    }
  });
});
