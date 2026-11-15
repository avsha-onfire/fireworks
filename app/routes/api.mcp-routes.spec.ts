import type { ActionFunctionArgs } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loader } from './api.mcp-check';
import { action } from './api.mcp-update-config';
import { REDACTED_VALUE } from '~/lib/services/mcpRedaction';
import { MCPService, type MCPConfig } from '~/lib/services/mcpService';

const mocks = vi.hoisted(() => ({ createMCPClient: vi.fn() }));

vi.mock('@ai-sdk/mcp', () => ({ createMCPClient: mocks.createMCPClient }));

const SECRETS = {
  bearer: 'Bearer crm-token-1f9a',
  apiKey: 'events-key-7c21d0',
  env: 'warehouse-password-55e3',
};

const TOOLS = { lookup_account: { description: 'Find an account by name' } };

const CHECK_URL = 'http://localhost/api/mcp-check';
const UPDATE_URL = 'http://localhost/api/mcp-update-config';

function config(): MCPConfig {
  return {
    mcpServers: {
      crm: {
        type: 'streamable-http',
        url: 'https://mcp.crm.example/mcp',
        headers: { Authorization: SECRETS.bearer },
      },
      events: {
        type: 'sse',
        url: 'https://events.example/sse',
        headers: { 'X-Api-Key': SECRETS.apiKey },
      },
      warehouse: {
        type: 'stdio',
        command: 'warehouse-mcp',
        args: ['--read-only'],
        env: { WAREHOUSE_PASSWORD: SECRETS.env },
      },
    },
  };
}

const URL_AND_ARG_SECRETS = ['ci-bot', 'url-password-3d', 'qs-secret-41', 'arg-secret-77', 'dsn-secret-08'];

/** Credentials placed where a custom server can carry them: the URL and the arguments. */
function configWithUrlAndArgSecrets(): MCPConfig {
  return {
    mcpServers: {
      crm: {
        type: 'streamable-http',
        url: 'https://ci-bot:url-password-3d@mcp.crm.example/mcp?api_key=qs-secret-41',
      },
      warehouse: {
        type: 'stdio',
        command: 'warehouse-mcp',
        args: ['--api-key', 'arg-secret-77', '--dsn=dsn-secret-08', '--read-only'],
      },
    },
  };
}

const MASKED_URL_AND_ARGS = {
  crm: `https://${REDACTED_VALUE}@mcp.crm.example/mcp?api_key=${REDACTED_VALUE}`,
  warehouse: ['--api-key', REDACTED_VALUE, `--dsn=${REDACTED_VALUE}`, '--read-only'],
};

function expectNoUrlOrArgSecrets(payload: string) {
  for (const secret of URL_AND_ARG_SECRETS) {
    expect(payload).not.toContain(secret);
  }
}

function routeArgs(request: Request) {
  return { request, params: {}, context: { clientAddress: '203.0.113.7' } } as unknown as ActionFunctionArgs;
}

function post(body: unknown, contentType: string | null = 'application/json') {
  const request = new Request(UPDATE_URL, { method: 'POST', body: JSON.stringify(body) });

  if (contentType === null) {
    request.headers.delete('Content-Type');
  } else {
    request.headers.set('Content-Type', contentType);
  }

  return action(routeArgs(request));
}

function check() {
  return loader(routeArgs(new Request(CHECK_URL)));
}

function expectNoSecrets(payload: string) {
  for (const secret of Object.values(SECRETS)) {
    expect(payload).not.toContain(secret);
  }
}

describe('MCP configuration routes', () => {
  beforeEach(async () => {
    /*
     * Like the real client, the fake keeps the transport it was given, and the
     * transport carries the headers or environment of its server.
     */
    mocks.createMCPClient.mockImplementation(async ({ transport }: { transport: unknown }) => ({
      transport,
      tools: async () => TOOLS,
      close: async () => undefined,
    }));

    await MCPService.getInstance().updateConfig({ mcpServers: {} });
  });

  describe('POST /api/mcp-update-config', () => {
    it('returns status, tools and display fields with every header and env value masked', async () => {
      const response = await post(config());
      const payload = await response.text();

      expect(response.status).toBe(200);
      expectNoSecrets(payload);
      expect(JSON.parse(payload)).toEqual({
        crm: {
          status: 'available',
          tools: TOOLS,
          config: {
            type: 'streamable-http',
            url: 'https://mcp.crm.example/mcp',
            headers: { Authorization: REDACTED_VALUE },
          },
        },
        events: {
          status: 'available',
          tools: TOOLS,
          config: {
            type: 'sse',
            url: 'https://events.example/sse',
            headers: { 'X-Api-Key': REDACTED_VALUE },
          },
        },
        warehouse: {
          status: 'available',
          tools: TOOLS,
          config: {
            type: 'stdio',
            command: 'warehouse-mcp',
            args: ['--read-only'],
            env: { WAREHOUSE_PASSWORD: REDACTED_VALUE },
          },
        },
      });
    });

    it('masks the values of a server that failed validation', async () => {
      const response = await post({
        mcpServers: { untyped: { url: 'https://mcp.crm.example/mcp', headers: { Authorization: SECRETS.bearer } } },
      });

      const payload = await response.text();

      expectNoSecrets(payload);
      expect(JSON.parse(payload)).toEqual({
        untyped: {
          status: 'unavailable',
          error: 'missing "type" field, only "sse" and "streamable-http" are valid options.',
          config: { url: 'https://mcp.crm.example/mcp', headers: { Authorization: REDACTED_VALUE } },
        },
      });
    });

    it('masks credentials in the URL and the arguments', async () => {
      const response = await post(configWithUrlAndArgSecrets());
      const payload = await response.text();

      expectNoUrlOrArgSecrets(payload);

      const servers = JSON.parse(payload) as Record<string, { config: { url?: string; args?: string[] } }>;

      expect(servers.crm.config.url).toBe(MASKED_URL_AND_ARGS.crm);
      expect(servers.warehouse.config.args).toEqual(MASKED_URL_AND_ARGS.warehouse);
    });

    it('masks URL and argument credentials quoted in a connection error', async () => {
      mocks.createMCPClient.mockImplementation(async ({ transport }: { transport: object }) => {
        throw new Error(
          'serverParams' in transport
            ? 'spawn warehouse-mcp --api-key arg-secret-77 --dsn=dsn-secret-08 failed'
            : 'fetch https://ci-bot:url-password-3d@mcp.crm.example/mcp?api_key=qs-secret-41 failed',
        );
      });

      const payload = await (await post(configWithUrlAndArgSecrets())).text();
      const servers = JSON.parse(payload) as Record<string, { error?: string }>;

      expectNoUrlOrArgSecrets(payload);
      expect(servers.crm.error).toBe(
        `fetch https://${REDACTED_VALUE}@mcp.crm.example/mcp?api_key=${REDACTED_VALUE} failed`,
      );
      expect(servers.warehouse.error).toBe(
        `spawn warehouse-mcp --api-key ${REDACTED_VALUE} --dsn=${REDACTED_VALUE} failed`,
      );
    });

    it('adds the security headers', async () => {
      const response = await post(config());

      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    });

    it('accepts JSON sent with a charset parameter', async () => {
      const response = await post(config(), 'Application/JSON; charset=utf-8');

      expect(response.status).toBe(200);
      expect(Object.keys((await response.json()) as object)).toEqual(['crm', 'events', 'warehouse']);
    });

    /*
     * These are the content types a page on another site can post without a
     * preflight, so accepting any of them would let that page swap the servers.
     */
    it.each([
      'text/plain',
      'text/plain;charset=UTF-8',
      'application/x-www-form-urlencoded',
      'multipart/form-data',
      null,
    ])('rejects content type %s and keeps the current servers', async (contentType) => {
      await post(config());

      const response = await post({ mcpServers: {} }, contentType);

      expect(response.status).toBe(415);
      await expect(response.json()).resolves.toEqual({ error: 'Content-Type must be application/json' });

      const current = (await (await check()).json()) as object;

      expect(Object.keys(current)).toEqual(['crm', 'events', 'warehouse']);
    });

    it('rejects a body that is not an object', async () => {
      const response = await post(null);

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'Invalid MCP servers configuration' });
    });

    it('answers 405 to other methods', async () => {
      const request = new Request(UPDATE_URL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config()),
      });

      const response = await action(routeArgs(request));

      expect(response.status).toBe(405);
    });
  });

  describe('GET /api/mcp-check', () => {
    it('returns the configured servers with every header and env value masked', async () => {
      await post(config());

      const response = await check();
      const payload = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expectNoSecrets(payload);

      const servers = JSON.parse(payload) as Record<string, { status: string; tools: unknown; config: unknown }>;

      expect(Object.keys(servers)).toEqual(['crm', 'events', 'warehouse']);
      expect(servers.crm).toEqual({
        status: 'available',
        tools: TOOLS,
        config: {
          type: 'streamable-http',
          url: 'https://mcp.crm.example/mcp',
          headers: { Authorization: REDACTED_VALUE },
        },
      });
      expect(servers.warehouse.config).toEqual({
        type: 'stdio',
        command: 'warehouse-mcp',
        args: ['--read-only'],
        env: { WAREHOUSE_PASSWORD: REDACTED_VALUE },
      });
    });

    it('masks credentials in the URL and the arguments, and still connects with them', async () => {
      await post(configWithUrlAndArgSecrets());

      const payload = await (await check()).text();

      expectNoUrlOrArgSecrets(payload);

      const servers = JSON.parse(payload) as Record<string, { config: { url?: string; args?: string[] } }>;

      expect(servers.crm.config.url).toBe(MASKED_URL_AND_ARGS.crm);
      expect(servers.warehouse.config.args).toEqual(MASKED_URL_AND_ARGS.warehouse);
      expect(mocks.createMCPClient).toHaveBeenCalledWith({
        transport: expect.objectContaining({
          serverParams: expect.objectContaining({
            args: ['--api-key', 'arg-secret-77', '--dsn=dsn-secret-08', '--read-only'],
          }),
        }),
      });
    });

    it('reconnects with the real credentials after a masked response', async () => {
      const { events } = config().mcpServers;

      mocks.createMCPClient.mockRejectedValueOnce(new Error('connection refused'));

      const failed = (await (await post({ mcpServers: { events } })).json()) as Record<string, unknown>;

      expect(failed.events).toEqual({
        status: 'unavailable',
        error: 'connection refused',
        config: { type: 'sse', url: 'https://events.example/sse', headers: { 'X-Api-Key': REDACTED_VALUE } },
      });

      const recovered = (await (await check()).json()) as Record<string, { status: string }>;

      expect(recovered.events.status).toBe('available');
      expect(mocks.createMCPClient).toHaveBeenLastCalledWith({
        transport: expect.objectContaining({ headers: { 'X-Api-Key': SECRETS.apiKey } }),
      });
    });

    it('answers 405 to other methods', async () => {
      const response = await loader(routeArgs(new Request(CHECK_URL, { method: 'DELETE' })));

      expect(response.status).toBe(405);
    });
  });
});
