import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MCPService, type MCPConfig } from './mcpService';

const mocks = vi.hoisted(() => ({
  createMCPClient: vi.fn(),
  logger: {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    setLevel: vi.fn(),
  },
}));

vi.mock('@ai-sdk/mcp', () => ({ createMCPClient: mocks.createMCPClient }));

vi.mock('~/utils/logger', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createScopedLogger: () => mocks.logger,
}));

const CONFIG_VALUES = [
  'Bearer crm-token-1f9a',
  'events-key-7c21d0',
  'warehouse-password-55e3',
  'mcp.crm.example',
  'events.example',
  'warehouse-mcp',
  '--account=acme',
];

function config(): MCPConfig {
  return {
    mcpServers: {
      crm: {
        type: 'streamable-http',
        url: 'https://mcp.crm.example/mcp',
        headers: { Authorization: 'Bearer crm-token-1f9a' },
      },
      events: {
        type: 'sse',
        url: 'https://events.example/sse',
        headers: { 'X-Api-Key': 'events-key-7c21d0' },
      },
      warehouse: {
        type: 'stdio',
        command: 'warehouse-mcp',
        args: ['--account=acme'],
        env: { WAREHOUSE_PASSWORD: 'warehouse-password-55e3' },
      },
    },
  };
}

function describeLogged(value: unknown): string {
  if (value instanceof Error) {
    return `${value.message}\n${value.stack}`;
  }

  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value) ?? String(value);
}

/** Everything the service wrote to its logger, at any level, as one string. */
function loggedText() {
  return [mocks.logger.trace, mocks.logger.debug, mocks.logger.info, mocks.logger.warn, mocks.logger.error]
    .flatMap((log) => log.mock.calls.flat())
    .map(describeLogged)
    .join('\n');
}

function expectNoConfigValues(text: string) {
  for (const value of CONFIG_VALUES) {
    expect(text).not.toContain(value);
  }
}

describe('MCPService logging', () => {
  beforeEach(() => {
    mocks.createMCPClient.mockImplementation(async () => ({
      tools: async () => ({ lookup_account: { description: 'Find an account by name' } }),
      close: async () => undefined,
    }));
  });

  it('names the servers being configured and nothing else from the config', async () => {
    const service = MCPService.getInstance();

    await service.updateConfig(config());
    await service.checkServersAvailabilities();
    await service.updateConfig({ mcpServers: {} });

    expect(mocks.logger.debug).toHaveBeenCalledWith('updating config for servers:', 'crm, events, warehouse');
    expectNoConfigValues(loggedText());
  });

  it('keeps config values out of the log when a server cannot be reached', async () => {
    mocks.createMCPClient.mockRejectedValue(new Error('connection refused'));

    const service = MCPService.getInstance();

    await service.updateConfig(config());
    await service.checkServersAvailabilities();

    const text = loggedText();

    expect(text).toContain('Failed to initialize MCP client for server: crm');
    expect(text).toContain('Failed to connect to server warehouse');
    expectNoConfigValues(text);
  });

  /*
   * The HTTP client quotes a header value it refuses, and a connection error
   * can quote the URL, the arguments or the environment of its server.
   */
  describe.each([
    {
      name: 'crm',
      server: {
        type: 'streamable-http',
        url: 'https://mcp.crm.example/mcp?api_key=qs-secret-41',
        headers: { Authorization: 'Bearer crm-token-1f9a' },
      },
      message:
        'Headers.append: "Bearer crm-token-1f9a" is an invalid header value (https://mcp.crm.example/mcp?api_key=qs-secret-41)',
      secrets: ['Bearer crm-token-1f9a', 'qs-secret-41'],
    },
    {
      name: 'warehouse',
      server: {
        type: 'stdio',
        command: 'warehouse-mcp',
        args: ['--api-key', 'arg-secret-77'],
        env: { WAREHOUSE_PASSWORD: 'warehouse-password-55e3' },
      },
      message: 'spawn warehouse-mcp --api-key arg-secret-77 failed with WAREHOUSE_PASSWORD=warehouse-password-55e3',
      secrets: ['arg-secret-77', 'warehouse-password-55e3'],
    },
  ])('when an error of $name quotes its secrets', ({ name, server, message, secrets }) => {
    const servers = { mcpServers: { [name]: server } } as unknown as MCPConfig;

    function expectMasked(...prefixes: string[]) {
      for (const prefix of prefixes) {
        expect(mocks.logger.error).toHaveBeenCalledWith(prefix, expect.stringContaining('••••'));
      }

      const text = loggedText();

      for (const secret of secrets) {
        expect(text).not.toContain(secret);
      }
    }

    it('masks them when the client cannot be created', async () => {
      mocks.createMCPClient.mockRejectedValue(new TypeError(message));

      const service = MCPService.getInstance();

      await service.updateConfig(servers);
      await service.checkServersAvailabilities();

      expectMasked(`Failed to initialize MCP client for server: ${name}`, `Failed to connect to server ${name}:`);
    });

    it('masks them when the server does not list its tools', async () => {
      mocks.createMCPClient.mockImplementation(async () => ({
        tools: async () => Promise.reject(new TypeError(message)),
        close: async () => undefined,
      }));

      const service = MCPService.getInstance();

      await service.updateConfig(servers);
      await service.checkServersAvailabilities();

      expect(mocks.logger.error).toHaveBeenCalledTimes(2);
      expectMasked(`Failed to get tools from server ${name}:`);
    });
  });

  it('keeps config values out of the log when a server config is invalid', async () => {
    const invalid = {
      mcpServers: {
        untyped: { url: 'https://mcp.crm.example/mcp', headers: { Authorization: 'Bearer crm-token-1f9a' } },
        mistyped: { type: 'sse', url: 'events.example', headers: { 'X-Api-Key': 'events-key-7c21d0' } },
      },
    } as unknown as MCPConfig;

    await MCPService.getInstance().updateConfig(invalid);

    const text = loggedText();

    expect(text).toContain('Failed to initialize MCP client for server: untyped');
    expect(text).toContain('Failed to initialize MCP client for server: mistyped');
    expectNoConfigValues(text);
  });

  it('does not fail on a config without a server map', async () => {
    await expect(MCPService.getInstance().updateConfig({} as MCPConfig)).resolves.toEqual({});
    expect(mocks.logger.debug).toHaveBeenCalledWith('updating config for servers:', '');
  });
});
