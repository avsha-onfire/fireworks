import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loader as checkLoader } from './api.mcp-check';
import { action as oauthAction, loader as oauthLoader } from './api.mcp-oauth.$step';
import { action as updateAction } from './api.mcp-update-config';
import { createFakeVendor, type FakeVendor } from '~/lib/.server/mcp-oauth/fake-vendor.testing';
import { BRAND } from '~/lib/brand';

const ORIGIN = 'http://localhost:5173';
const CLIENT_ID = 'hubspot-client-id';
const CLIENT_SECRET = 'hubspot-client-secret-9f3c';
const ENV = { HUBSPOT_MCP_CLIENT_ID: CLIENT_ID, HUBSPOT_MCP_CLIENT_SECRET: CLIENT_SECRET };

let vendor: FakeVendor;
let logs: string[];
let address = 0;

/** Every response body and header a test received, to check that nothing secret was returned. */
let returned: string[];

beforeEach(() => {
  logs = [];
  returned = [];

  // Settings in the developer's own environment must not leak into these tests.
  for (const name of [
    'HUBSPOT_MCP_CLIENT_ID',
    'HUBSPOT_MCP_CLIENT_SECRET',
    'SALESFORCE_MCP_CLIENT_ID',
    'SALESFORCE_MCP_CLIENT_SECRET',
    'MCP_OAUTH_REDIRECT_URI',
  ]) {
    vi.stubEnv(name, '');
  }

  vendor = createFakeVendor({
    serverUrl: 'https://mcp.hubspot.com',
    authorizationServer: 'https://mcp.hubspot.com',
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
  });
  vi.stubGlobal('fetch', vendor.fetch);

  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** A fresh client address per call keeps the per-address rate limit out of the way. */
function args(request: Request, step?: string, env: Record<string, string> = ENV) {
  address += 1;

  return {
    request,
    params: step ? { step } : {},
    context: { cloudflare: { env }, clientAddress: `203.0.113.${(address % 250) + 1}` },
  } as unknown as LoaderFunctionArgs & ActionFunctionArgs;
}

async function record(response: Response): Promise<Response> {
  const body = await response.clone().text();

  returned.push(body, ...[...response.headers.entries()].map(([name, value]) => `${name}: ${value}`));

  return response;
}

function headers(cookie?: string, extra: Record<string, string> = {}) {
  return { ...(cookie ? { Cookie: cookie } : {}), ...extra };
}

async function post(step: string, body: unknown, cookie?: string, origin = ORIGIN, env: Record<string, string> = ENV) {
  const request = new Request(`${origin}/api/mcp-oauth/${step}`, {
    method: 'POST',
    headers: headers(cookie, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });

  return record(await oauthAction(args(request, step, env)));
}

async function get(path: string, cookie?: string) {
  const url = new URL(path, ORIGIN);
  const request = new Request(url, { headers: headers(cookie) });
  const step = url.pathname.split('/').pop();

  return record(await oauthLoader(args(request, step)));
}

/** Response bodies in these tests are JSON objects of a known shape. */
async function readJson(response: Response): Promise<any> {
  return response.json();
}

function sessionCookie(response: Response): string {
  const setCookie = response.headers.get('set-cookie') ?? '';

  return setCookie.split(';')[0];
}

/** Starts a sign-in, approves it at the fake vendor and returns the browser's cookie and the callback URL. */
async function signInAtVendor(cookie?: string, options: { deny?: boolean } = {}) {
  const response = await post('start', { connectorId: 'gtm-hubspot' }, cookie);
  const { authorizationUrl } = (await response.json()) as { authorizationUrl: string };

  return {
    cookie: cookie ?? sessionCookie(response),
    callbackUrl: await vendor.approve(authorizationUrl, options),
  };
}

async function finishCallback(callbackUrl: string, cookie?: string) {
  const callback = await get(callbackUrl, cookie);

  expect(callback.status).toBe(303);

  const location = callback.headers.get('location')!;

  expect(location).not.toContain('code=');
  expect(location).not.toContain('state=');

  return { location, page: await get(location, cookie) };
}

async function check(cookie?: string) {
  const request = new Request(`${ORIGIN}/api/mcp-check`, { headers: headers(cookie) });

  return record(await checkLoader(args(request)));
}

async function updateConfig(cookie?: string) {
  const request = new Request(`${ORIGIN}/api/mcp-update-config`, {
    method: 'POST',
    headers: headers(cookie, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ mcpServers: {} }),
  });

  return record(await updateAction(args(request)));
}

function expectNothingSecret() {
  const everything = [...returned, ...logs].join('\n');

  expect(vendor.secrets().length).toBeGreaterThan(3);

  for (const secret of vendor.secrets()) {
    expect(everything).not.toContain(secret);
  }
}

describe('/api/mcp-oauth', () => {
  it('connects HubSpot end to end without returning or logging a token, code, verifier or secret', async () => {
    const start = await post('start', { connectorId: 'gtm-hubspot' });
    const startBody = (await start.json()) as { authorizationUrl: string };

    expect(start.status).toBe(200);
    expect(Object.keys(startBody)).toEqual(['authorizationUrl']);
    expect(start.headers.get('set-cookie')).toMatch(
      /^mcp_oauth_session=[A-Za-z0-9_-]{43}; Path=\/; Max-Age=2592000; HttpOnly; SameSite=Lax$/,
    );
    expect(start.headers.get('cache-control')).toBe('no-store');

    const cookie = sessionCookie(start);
    const { location, page } = await finishCallback(await vendor.approve(startBody.authorizationUrl), cookie);
    const html = await page.text();

    expect(location).toBe('/api/mcp-oauth/callback?result=connected&connector=gtm-hubspot');
    expect(page.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(html).toContain('<h1>HubSpot is connected</h1>');
    expect(html).toContain(`Return to ${BRAND.name}`);
    expect(html).toContain('"result":"connected"');

    const status = await readJson(await get('/api/mcp-oauth/status', cookie));

    expect(status.connectors['gtm-hubspot']).toMatchObject({
      configured: true,
      state: 'connected',
      variant: 'default',
    });

    for (const response of [await check(cookie), await updateConfig(cookie)]) {
      const servers = await readJson(response);

      expect(servers['gtm-hubspot'].status).toBe('available');
      expect(servers['gtm-hubspot'].config).toEqual({ type: 'streamable-http', url: 'https://mcp.hubspot.com' });
      expect(Object.keys(servers['gtm-hubspot'].tools)).toContain('list_deal_pipelines');
    }

    expect(vendor.mcpAuthorizations.every((value) => value?.startsWith('Bearer access-'))).toBe(true);
    expectNothingSecret();
  });

  it("keeps one browser's sign-in from every other visitor of the server", async () => {
    const { cookie, callbackUrl } = await signInAtVendor();

    await finishCallback(callbackUrl, cookie);

    const other = sessionCookie(await post('start', { connectorId: 'gtm-hubspot' }));

    for (const visitor of [undefined, other]) {
      expect((await readJson(await check(visitor)))['gtm-hubspot']).toBeUndefined();
      expect((await readJson(await get('/api/mcp-oauth/status', visitor))).connectors['gtm-hubspot'].state).toBe(
        'not-connected',
      );
    }
  });

  it('disconnects, after which the server is gone from the lists', async () => {
    const { cookie, callbackUrl } = await signInAtVendor();

    await finishCallback(callbackUrl, cookie);

    expect(await readJson(await post('disconnect', { connectorId: 'gtm-hubspot' }, cookie))).toEqual({
      disconnected: true,
    });
    expect((await readJson(await get('/api/mcp-oauth/status', cookie))).connectors['gtm-hubspot'].state).toBe(
      'not-connected',
    );
    expect((await readJson(await check(cookie)))['gtm-hubspot']).toBeUndefined();
    expectNothingSecret();
  });

  it('completes a callback only in the browser that started it, without redeeming the code elsewhere', async () => {
    const { callbackUrl } = await signInAtVendor();
    const { location, page } = await finishCallback(callbackUrl, undefined);

    expect(location).toBe('/api/mcp-oauth/callback?result=wrong-browser&connector=gtm-hubspot');
    expect(await page.text()).toContain('started in another browser');
    expect(vendor.tokenRequests).toHaveLength(0);
  });

  it('reports a sign-in refused at the vendor', async () => {
    const { cookie, callbackUrl } = await signInAtVendor(undefined, { deny: true });
    const { location } = await finishCallback(callbackUrl, cookie);

    expect(location).toBe('/api/mcp-oauth/callback?result=cancelled&connector=gtm-hubspot');
    expect(vendor.tokenRequests).toHaveLength(0);
  });

  it('shows only known results and connectors on the result page', async () => {
    const page = await get('/api/mcp-oauth/callback?result=%3Cscript%3Ealert(1)%3C%2Fscript%3E&connector=evil');
    const html = await page.text();

    expect(html).toContain('<h1>The vendor is not connected</h1>');
    expect(html).toContain('"result":"failed"');
    expect(html).not.toContain('alert(1)');
    expect(html).not.toContain('evil');
  });

  it('uses a __Host- Secure cookie over HTTPS', async () => {
    const start = await post('start', { connectorId: 'gtm-hubspot' }, undefined, 'https://fireworks.example.com');

    expect(start.headers.get('set-cookie')).toMatch(
      /^__Host-mcp_oauth_session=[A-Za-z0-9_-]{43}; Path=\/; Max-Age=2592000; HttpOnly; SameSite=Lax; Secure$/,
    );
  });

  it.each([
    [
      'a connector without sign-in',
      { connectorId: 'gtm-pipedrive' },
      ENV,
      ORIGIN,
      404,
      'cannot be connected by signing in',
    ],
    [
      'an unknown environment',
      { connectorId: 'gtm-hubspot', variant: 'eu' },
      ENV,
      ORIGIN,
      400,
      'Choose a HubSpot environment.',
    ],
    [
      'a server without app credentials',
      { connectorId: 'gtm-hubspot' },
      {},
      ORIGIN,
      409,
      'HubSpot sign-in is not set up on this server.',
    ],
    [
      'a plain-HTTP address that is not localhost',
      { connectorId: 'gtm-hubspot' },
      ENV,
      'http://192.168.1.20:5173',
      400,
      'HTTPS or on localhost',
    ],
  ])('refuses to start for %s', async (_case, body, env, origin, status, message) => {
    const response = await post('start', body, undefined, origin, env);

    expect(response.status).toBe(status);
    expect((await readJson(response)).error).toContain(message);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('accepts only JSON for actions, so a cross-site form cannot start or end a sign-in', async () => {
    for (const step of ['start', 'disconnect']) {
      const request = new Request(`${ORIGIN}/api/mcp-oauth/${step}`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: '{"connectorId":"gtm-hubspot"}',
      });

      expect((await oauthAction(args(request, step))).status).toBe(415);
    }
  });

  it('reports configuration and the callback URL without creating a session', async () => {
    const response = await get('/api/mcp-oauth/status');
    const body = await readJson(response);

    expect(response.headers.get('set-cookie')).toBeNull();
    expect(body.redirectUri).toBe(`${ORIGIN}/api/mcp-oauth/callback`);
    expect(body.connectors['gtm-hubspot']).toEqual({
      configured: true,
      state: 'not-connected',
      variant: null,
      connectedAt: null,
    });
    expect(body.connectors['gtm-salesforce'].configured).toBe(false);
  });
});
