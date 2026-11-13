import { describe, expect, it, vi } from 'vitest';
import { createAuthorizedFetch } from './authorized-fetch';

function recorder(statuses: number[]) {
  const calls: Array<{ url: string; authorization: string | null; accept: string | null; body: unknown }> = [];

  const fetchFn = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);

    calls.push({
      url: String(url),
      authorization: headers.get('authorization'),
      accept: headers.get('accept'),
      body: init?.body,
    });

    return new Response(JSON.stringify({ ok: true }), { status: statuses[calls.length - 1] ?? 200 });
  });

  return { fetchFn, calls };
}

describe('createAuthorizedFetch', () => {
  it('sends the current token as a Bearer header on every request and keeps the other headers', async () => {
    const { fetchFn, calls } = recorder([200, 200]);

    let token = 'token-one';

    const authorized = createAuthorizedFetch({ getToken: async () => token, refreshToken: vi.fn(), fetchFn });

    await authorized('https://mcp.example.com/', {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: '{}',
    });
    token = 'token-two';
    await authorized('https://mcp.example.com/', {
      method: 'POST',
      headers: new Headers({ Accept: 'text/event-stream' }),
    });

    expect(calls.map((call) => call.authorization)).toEqual(['Bearer token-one', 'Bearer token-two']);
    expect(calls.map((call) => call.accept)).toEqual(['application/json', 'text/event-stream']);
  });

  it('replaces an Authorization header set by the caller', async () => {
    const { fetchFn, calls } = recorder([200]);
    const authorized = createAuthorizedFetch({ getToken: async () => 'stored', refreshToken: vi.fn(), fetchFn });

    await authorized('https://mcp.example.com/', { headers: { Authorization: 'Bearer something-else' } });

    expect(calls[0].authorization).toBe('Bearer stored');
  });

  it('retries a 401 once with a refreshed token and the same body', async () => {
    const { fetchFn, calls } = recorder([401, 200]);
    const refreshToken = vi.fn(async () => 'fresh');
    const authorized = createAuthorizedFetch({ getToken: async () => 'stale', refreshToken, fetchFn });

    const response = await authorized('https://mcp.example.com/', { method: 'POST', body: '{"id":1}' });

    expect(response.status).toBe(200);
    expect(refreshToken).toHaveBeenCalledWith('stale');
    expect(calls.map((call) => [call.authorization, call.body])).toEqual([
      ['Bearer stale', '{"id":1}'],
      ['Bearer fresh', '{"id":1}'],
    ]);
  });

  it('returns a second 401 instead of looping', async () => {
    const { fetchFn, calls } = recorder([401, 401]);
    const refreshToken = vi.fn(async () => 'fresh');
    const authorized = createAuthorizedFetch({ getToken: async () => 'stale', refreshToken, fetchFn });

    expect((await authorized('https://mcp.example.com/')).status).toBe(401);
    expect(refreshToken).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(2);
  });

  it('passes other failures through without refreshing', async () => {
    const { fetchFn } = recorder([403]);
    const refreshToken = vi.fn();
    const authorized = createAuthorizedFetch({ getToken: async () => 'token', refreshToken, fetchFn });

    expect((await authorized('https://mcp.example.com/')).status).toBe(403);
    expect(refreshToken).not.toHaveBeenCalled();
  });

  it('lets a failed refresh reach the transport as an error', async () => {
    const { fetchFn } = recorder([401]);

    const authorized = createAuthorizedFetch({
      getToken: async () => 'stale',
      refreshToken: async () => {
        throw new Error('Sign in to HubSpot again in Settings, Data connectors.');
      },
      fetchFn,
    });

    await expect(authorized('https://mcp.example.com/')).rejects.toThrow('Sign in to HubSpot again');
  });
});
