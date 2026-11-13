import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { McpOAuthError } from './errors';
import { createFakeVendor, type FakeVendor, type FakeVendorOptions } from './fake-vendor.testing';
import { completeSignIn, startSignIn } from './flow';
import { OAuthSessionStore } from './store';
import { getSignInConnector, getSignInVariant, type GtmSignInConnector } from '~/lib/gtm/connectors';

const REDIRECT_URI = 'http://localhost:5173/api/mcp-oauth/callback';
const HUBSPOT_CREDENTIALS = { clientId: 'hubspot-client-id', clientSecret: 'hubspot-client-secret-9f3c' };
const SALESFORCE_CREDENTIALS = { clientId: 'salesforce-consumer-key' };

const hubspot = getSignInConnector('gtm-hubspot')!;
const salesforce = getSignInConnector('gtm-salesforce')!;

function hubspotVendor(overrides: Partial<FakeVendorOptions> = {}): FakeVendor {
  return createFakeVendor({
    serverUrl: 'https://mcp.hubspot.com',
    authorizationServer: 'https://mcp.hubspot.com',
    clientId: HUBSPOT_CREDENTIALS.clientId,
    clientSecret: HUBSPOT_CREDENTIALS.clientSecret,
    ...overrides,
  });
}

function salesforceSandboxVendor(): FakeVendor {
  return createFakeVendor({
    serverUrl: 'https://api.salesforce.com/platform/mcp/v1/sandbox/platform/sobject-reads',
    authorizationServer: 'https://test.salesforce.com',
    discovery: 'oidc',
    clientId: SALESFORCE_CREDENTIALS.clientId,
    scopesSupported: ['mcp_api', 'refresh_token'],
  });
}

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

async function start(
  store: OAuthSessionStore,
  sessionId: string,
  vendor: FakeVendor,
  connector: GtmSignInConnector = hubspot,
  variant = connector.signIn.variants[0],
  credentials: { clientId: string; clientSecret?: string } = HUBSPOT_CREDENTIALS,
) {
  return startSignIn({
    store,
    sessionId,
    connector,
    variant,
    credentials,
    redirectUri: REDIRECT_URI,
    options: { fetchFn: vendor.fetch },
  });
}

function callbackParams(callbackUrl: string) {
  const url = new URL(callbackUrl);

  return {
    state: url.searchParams.get('state') ?? '',
    code: url.searchParams.get('code') ?? undefined,
    error: url.searchParams.get('error') ?? undefined,
  };
}

async function rejection(promise: Promise<unknown>): Promise<McpOAuthError> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );

  expect(error).toBeInstanceOf(McpOAuthError);

  return error as McpOAuthError;
}

describe('startSignIn', () => {
  it('builds a PKCE authorization request from the server metadata, with the resource and no scope for HubSpot', async () => {
    const store = new OAuthSessionStore();
    const session = store.createSession();
    const vendor = hubspotVendor();

    const url = new URL(await start(store, session.id, vendor));

    expect(`${url.origin}${url.pathname}`).toBe(vendor.authorizeUrl);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe(HUBSPOT_CREDENTIALS.clientId);
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT_URI);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.searchParams.get('state')).toMatch(/^[A-Za-z0-9_-]{43}$/);

    // RFC 8707: the metadata's spelling, without a trailing slash added.
    expect(url.searchParams.get('resource')).toBe('https://mcp.hubspot.com');

    // HubSpot sets scopes from its tools; none is requested.
    expect(url.searchParams.has('scope')).toBe(false);

    // Neither the verifier nor the client secret goes to the browser.
    expect(url.href).not.toContain(HUBSPOT_CREDENTIALS.clientSecret);
  });

  it('asks Salesforce for its documented scopes through OpenID discovery, on the sandbox server', async () => {
    const store = new OAuthSessionStore();
    const session = store.createSession();
    const vendor = salesforceSandboxVendor();
    const sandbox = getSignInVariant(salesforce, 'sandbox')!;

    const url = new URL(await start(store, session.id, vendor, salesforce, sandbox, SALESFORCE_CREDENTIALS));

    expect(`${url.origin}${url.pathname}`).toBe('https://test.salesforce.com/services/oauth2/authorize');
    expect(url.searchParams.get('scope')).toBe('mcp_api refresh_token');
    expect(url.searchParams.get('resource')).toBe(
      'https://api.salesforce.com/platform/mcp/v1/sandbox/platform/sobject-reads',
    );
  });

  it.each([
    [
      'an authorization server the docs do not name',
      { resourceMetadata: { authorization_servers: ['https://login.example.com'] } },
    ],
    ['endpoints on another host', { metadata: { token_endpoint: 'https://tokens.example.com/token' } }],
    ['no PKCE S256', { metadata: { code_challenge_methods_supported: ['plain'] } }],
    ['no PKCE methods listed', { metadata: { code_challenge_methods_supported: undefined } }],
    ['a resource for another server', { resourceMetadata: { resource: 'https://other.example.com/mcp' } }],
  ])('stops before sending anything when the metadata has %s', async (_case, overrides) => {
    const store = new OAuthSessionStore();
    const session = store.createSession();
    const vendor = hubspotVendor(overrides as Partial<FakeVendorOptions>);

    const error = await rejection(start(store, session.id, vendor));

    expect(error.code).toBe('untrusted-metadata');
    expect(vendor.tokenRequests).toHaveLength(0);
  });
});

describe('completeSignIn (the callback)', () => {
  it('exchanges the code with the verifier, secret and resource, and stores the tokens on the session', async () => {
    const store = new OAuthSessionStore();
    const session = store.createSession();
    const vendor = hubspotVendor();
    const { state, code } = callbackParams(await vendor.approve(await start(store, session.id, vendor)));

    const { connectorId } = await completeSignIn({
      store,
      sessionId: session.id,
      state,
      code,
      credentialsFor: () => HUBSPOT_CREDENTIALS,
      options: { fetchFn: vendor.fetch },
    });

    const [exchange] = vendor.tokenRequests;

    expect(connectorId).toBe('gtm-hubspot');
    expect(exchange.get('grant_type')).toBe('authorization_code');
    expect(exchange.get('code_verifier')).toMatch(/^[A-Za-z0-9_~.-]{43,128}$/);
    expect(exchange.get('client_secret')).toBe(HUBSPOT_CREDENTIALS.clientSecret);
    expect(exchange.get('redirect_uri')).toBe(REDIRECT_URI);
    expect(exchange.get('resource')).toBe('https://mcp.hubspot.com');

    const connection = store.getConnection(session.id, 'gtm-hubspot');

    expect(connection?.status).toBe('connected');
    expect(connection?.tokens?.accessToken).toMatch(/^access-/);
    expect(connection?.tokens?.refreshToken).toMatch(/^refresh-/);
    expect(connection?.tokens?.expiresAt).toBeGreaterThan(Date.now());
  });

  it('accepts each state once', async () => {
    const store = new OAuthSessionStore();
    const session = store.createSession();
    const vendor = hubspotVendor();
    const params = callbackParams(await vendor.approve(await start(store, session.id, vendor)));

    const complete = () =>
      completeSignIn({
        store,
        sessionId: session.id,
        ...params,
        credentialsFor: () => HUBSPOT_CREDENTIALS,
        options: { fetchFn: vendor.fetch },
      });

    await complete();

    expect((await rejection(complete())).code).toBe('expired');
    expect(vendor.tokenRequests).toHaveLength(1);
  });

  it('refuses a callback from another session without redeeming the code', async () => {
    const store = new OAuthSessionStore();
    const attacker = store.createSession();
    const victim = store.createSession();
    const vendor = hubspotVendor();
    const params = callbackParams(await vendor.approve(await start(store, attacker.id, vendor)));

    for (const sessionId of [victim.id, undefined]) {
      const error = await rejection(
        completeSignIn({
          store,
          sessionId,
          ...params,
          credentialsFor: () => HUBSPOT_CREDENTIALS,
          options: { fetchFn: vendor.fetch },
        }),
      );

      expect(['wrong-browser', 'expired']).toContain(error.code);
    }

    expect(vendor.tokenRequests).toHaveLength(0);
    expect(store.getConnection(attacker.id, 'gtm-hubspot')).toBeUndefined();
    expect(store.getConnection(victim.id, 'gtm-hubspot')).toBeUndefined();
  });

  it('reports a refused sign-in without calling the token endpoint', async () => {
    const store = new OAuthSessionStore();
    const session = store.createSession();
    const vendor = hubspotVendor();
    const params = callbackParams(await vendor.approve(await start(store, session.id, vendor), { deny: true }));

    const error = await rejection(
      completeSignIn({
        store,
        sessionId: session.id,
        ...params,
        credentialsFor: () => HUBSPOT_CREDENTIALS,
        options: { fetchFn: vendor.fetch },
      }),
    );

    expect(error.code).toBe('denied');
    expect(vendor.tokenRequests).toHaveLength(0);
  });

  it('lets a pending sign-in expire after 10 minutes', async () => {
    let now = 1_000_000;

    const store = new OAuthSessionStore(() => now);
    const session = store.createSession();
    const vendor = hubspotVendor();
    const params = callbackParams(await vendor.approve(await start(store, session.id, vendor)));

    now += 10 * 60 * 1000 + 1;

    const error = await rejection(
      completeSignIn({
        store,
        sessionId: session.id,
        ...params,
        credentialsFor: () => HUBSPOT_CREDENTIALS,
        options: { fetchFn: vendor.fetch },
      }),
    );

    expect(error.code).toBe('expired');
  });

  it('logs a failed exchange without the code, the verifier or the client secret', async () => {
    const store = new OAuthSessionStore();
    const session = store.createSession();
    const vendor = hubspotVendor();
    const params = callbackParams(await vendor.approve(await start(store, session.id, vendor)));

    const error = await rejection(
      completeSignIn({
        store,
        sessionId: session.id,
        ...params,
        credentialsFor: () => ({ ...HUBSPOT_CREDENTIALS, clientSecret: 'wrong-secret-77aa' }),
        options: { fetchFn: vendor.fetch },
      }),
    );

    expect(error.code).toBe('exchange-failed');
    expect(error.message).toBe('HubSpot did not accept the sign-in. Try again.');
    expect(logs.join('\n')).toContain('authorization code exchange failed');

    for (const secret of [...vendor.secrets(), 'wrong-secret-77aa']) {
      expect(logs.join('\n')).not.toContain(secret);
      expect(error.message).not.toContain(secret);
    }
  });
});
