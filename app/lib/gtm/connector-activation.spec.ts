import { beforeEach, describe, expect, it, vi } from 'vitest';

interface ServerState {
  status: 'available' | 'unavailable';
  tools?: Record<string, unknown>;
  error?: string;
}

interface Settings {
  maxLLMSteps: number;
  mcpConfig: { mcpServers: Record<string, unknown> };
}

const mocks = vi.hoisted(() => ({
  initialize: vi.fn(),
  updateSettings: vi.fn(),
  state: {
    error: null as string | null,
    isUpdatingConfig: false,
    settings: { maxLLMSteps: 5, mcpConfig: { mcpServers: {} } } as Settings,
    serverTools: {} as Record<string, ServerState>,
  },

  /** What the server reports after each save, in call order; the last entry repeats. */
  serverResponses: [] as Array<Record<string, ServerState>>,
}));

vi.mock('~/lib/stores/mcp', () => ({
  useMCPStore: {
    getState: () => ({ ...mocks.state, initialize: mocks.initialize, updateSettings: mocks.updateSettings }),
  },
}));

import { addGtmConnector, getGtmConnectorState, removeGtmConnector } from './connector-activation';
import { GTM_CONNECTORS, isOAuthConnector, isTokenConnector, type GtmTokenConnector } from './connectors';

function getConnector(id: string): GtmTokenConnector {
  const connector = GTM_CONNECTORS.filter(isTokenConnector).find((candidate) => candidate.id === id);

  if (!connector) {
    throw new Error(`No token connector with id ${id}`);
  }

  return connector;
}

const linear = getConnector('gtm-linear');
const linearValues = { apiKey: 'lin_api_key' };
const linearConfig = linear.buildConfig(linearValues);

const userServer = { type: 'streamable-http', url: 'https://mcp.example.com/mcp' };
const savedSettings: Settings = { maxLLMSteps: 9, mcpConfig: { mcpServers: { mine: userServer } } };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.error = null;
  mocks.state.isUpdatingConfig = false;
  mocks.state.settings = savedSettings;
  mocks.state.serverTools = { mine: { status: 'available', tools: { search_docs: {} } } };
  mocks.serverResponses = [];
  mocks.initialize.mockResolvedValue(undefined);
  mocks.updateSettings.mockImplementation(async (settings: Settings) => {
    const call = mocks.updateSettings.mock.calls.length - 1;

    mocks.state.settings = settings;
    mocks.state.serverTools = mocks.serverResponses[Math.min(call, mocks.serverResponses.length - 1)] ?? {};
  });
});

describe('addGtmConnector', () => {
  it('saves the connector next to the existing servers and settings', async () => {
    mocks.serverResponses = [
      {
        mine: { status: 'available', tools: { search_docs: {} } },
        'gtm-linear': { status: 'available', tools: { list_issues: {} } },
      },
    ];

    await addGtmConnector(linear, linearValues);

    expect(mocks.initialize).toHaveBeenCalledTimes(1);
    expect(mocks.updateSettings).toHaveBeenCalledTimes(1);
    expect(mocks.updateSettings).toHaveBeenCalledWith({
      maxLLMSteps: 9,
      mcpConfig: { mcpServers: { mine: userServer, 'gtm-linear': linearConfig } },
    });
  });

  it('refuses to write when the saved settings failed to load', async () => {
    mocks.state.error = 'Error parsing saved mcp config: Unexpected token';

    await expect(addGtmConnector(linear, linearValues)).rejects.toThrow('could not be loaded, so nothing was changed');
    expect(mocks.initialize).toHaveBeenCalledTimes(1);
    expect(mocks.updateSettings).not.toHaveBeenCalled();
  });

  it('refuses to write while another save is running', async () => {
    mocks.state.isUpdatingConfig = true;

    await expect(addGtmConnector(linear, linearValues)).rejects.toThrow('still being saved');
    expect(mocks.updateSettings).not.toHaveBeenCalled();
  });

  it('rejects invalid input before touching the store', async () => {
    await expect(addGtmConnector(linear, { apiKey: 'abc\r\nX-Injected: 1' })).rejects.toThrow('API key must be');
    await expect(addGtmConnector(linear, {})).rejects.toThrow('API key is required.');
    expect(mocks.initialize).not.toHaveBeenCalled();
    expect(mocks.updateSettings).not.toHaveBeenCalled();
  });

  it('rejects connectors that need a vendor sign-in', async () => {
    const [salesforce] = GTM_CONNECTORS.filter(isOAuthConnector);

    await expect(addGtmConnector(salesforce, {})).rejects.toThrow('needs vendor sign-in');
    expect(mocks.updateSettings).not.toHaveBeenCalled();
  });

  it('reports a failed save without a second write', async () => {
    mocks.updateSettings.mockRejectedValueOnce(new Error('Server responded with 500: Internal Server Error'));

    await expect(addGtmConnector(linear, linearValues)).rejects.toThrow(
      'Linear MCP server was not added because the connector settings could not be saved (Server responded with 500: Internal Server Error).',
    );
    expect(mocks.updateSettings).toHaveBeenCalledTimes(1);
  });

  it('restores the previous settings when the vendor rejects the connection', async () => {
    mocks.serverResponses = [
      {
        mine: { status: 'available', tools: { search_docs: {} } },
        'gtm-linear': { status: 'unavailable', error: 'HTTP 401 Unauthorized' },
      },
      { mine: { status: 'available', tools: { search_docs: {} } } },
    ];

    await expect(addGtmConnector(linear, linearValues)).rejects.toThrow(
      'Linear MCP server could not connect with these details (HTTP 401 Unauthorized). The connector was not added.',
    );
    expect(mocks.updateSettings).toHaveBeenCalledTimes(2);
    expect(mocks.updateSettings).toHaveBeenLastCalledWith(savedSettings);
    expect(mocks.state.settings).toBe(savedSettings);
  });

  it('restores the previous settings when the server does not report the connector at all', async () => {
    mocks.serverResponses = [{ mine: { status: 'available', tools: { search_docs: {} } } }];

    await expect(addGtmConnector(linear, linearValues)).rejects.toThrow('could not connect with these details.');
    expect(mocks.updateSettings).toHaveBeenLastCalledWith(savedSettings);
  });

  it('restores the previous settings when a tool name is already provided by another server', async () => {
    mocks.serverResponses = [
      {
        mine: { status: 'available', tools: { search_docs: {} } },
        'gtm-linear': { status: 'available', tools: { list_issues: {}, search_docs: {} } },
      },
      { mine: { status: 'available', tools: { search_docs: {} } } },
    ];

    await expect(addGtmConnector(linear, linearValues)).rejects.toThrow(
      'offers a tool named "search_docs", which your MCP server "mine" already provides. The connector was not added.',
    );
    expect(mocks.updateSettings).toHaveBeenCalledTimes(2);
    expect(mocks.updateSettings).toHaveBeenLastCalledWith(savedSettings);
  });

  it.each(['web_search', 'project_read_file', 'agent_complete'])(
    'restores the previous settings when a tool is named like the built-in %s',
    async (toolName) => {
      mocks.serverResponses = [{ 'gtm-linear': { status: 'available', tools: { [toolName]: {} } } }, {}];

      await expect(addGtmConnector(linear, linearValues)).rejects.toThrow(
        `offers a tool named "${toolName}", which is also the name of a built-in tool. The connector was not added.`,
      );
      expect(mocks.updateSettings).toHaveBeenLastCalledWith(savedSettings);
    },
  );

  it('ignores tool names of servers that are not connected', async () => {
    mocks.serverResponses = [
      {
        mine: { status: 'unavailable', error: 'could not connect to server' },
        'gtm-linear': { status: 'available', tools: { search_docs: {} } },
      },
    ];

    await expect(addGtmConnector(linear, linearValues)).resolves.toBeUndefined();
    expect(mocks.updateSettings).toHaveBeenCalledTimes(1);
  });

  it('says how to remove the connector by hand when restoring fails', async () => {
    mocks.serverResponses = [{ 'gtm-linear': { status: 'unavailable', error: 'HTTP 401 Unauthorized' } }];
    mocks.updateSettings
      .mockImplementationOnce(async () => {
        mocks.state.serverTools = mocks.serverResponses[0];
      })
      .mockRejectedValueOnce(new Error('Server responded with 500: Internal Server Error'));

    await expect(addGtmConnector(linear, linearValues)).rejects.toThrow(
      'delete "gtm-linear" from the MCP configuration JSON and save.',
    );
    expect(mocks.updateSettings).toHaveBeenCalledTimes(2);
  });
});

describe('removeGtmConnector', () => {
  it('removes only the named connector', async () => {
    mocks.state.settings = {
      maxLLMSteps: 9,
      mcpConfig: { mcpServers: { mine: userServer, 'gtm-linear': linearConfig } },
    };

    await removeGtmConnector('gtm-linear');

    expect(mocks.initialize).toHaveBeenCalledTimes(1);
    expect(mocks.updateSettings).toHaveBeenCalledTimes(1);
    expect(mocks.updateSettings).toHaveBeenCalledWith(savedSettings);
  });

  it('does not write when the connector is not saved', async () => {
    await removeGtmConnector('gtm-linear');

    expect(mocks.updateSettings).not.toHaveBeenCalled();
  });

  it('refuses to write when the settings failed to load or a save is running', async () => {
    mocks.state.settings = { maxLLMSteps: 5, mcpConfig: { mcpServers: { 'gtm-linear': linearConfig } } };
    mocks.state.error = 'Error parsing saved mcp config: Unexpected token';

    await expect(removeGtmConnector('gtm-linear')).rejects.toThrow('nothing was changed');

    mocks.state.error = null;
    mocks.state.isUpdatingConfig = true;

    await expect(removeGtmConnector('gtm-linear')).rejects.toThrow('still being saved');
    expect(mocks.updateSettings).not.toHaveBeenCalled();
  });
});

describe('getGtmConnectorState', () => {
  const saved = { mcpConfig: { mcpServers: { 'gtm-linear': linearConfig } } };
  const available = { status: 'available' as const, tools: {}, client: null as never, config: linearConfig };
  const unavailable = { status: 'unavailable' as const, error: 'offline', client: null, config: linearConfig };

  it('is not-added without a saved entry, even if the server still lists one', () => {
    const settings = { mcpConfig: { mcpServers: {} } };

    expect(getGtmConnectorState('gtm-linear', settings, {})).toBe('not-added');
    expect(getGtmConnectorState('gtm-linear', settings, { 'gtm-linear': available })).toBe('not-added');
    expect(getGtmConnectorState('toString', settings, {})).toBe('not-added');
  });

  it('is active only while the server reports the saved entry as available', () => {
    expect(getGtmConnectorState('gtm-linear', saved, { 'gtm-linear': available })).toBe('active');
    expect(getGtmConnectorState('gtm-linear', saved, { 'gtm-linear': unavailable })).toBe('saved-inactive');
    expect(getGtmConnectorState('gtm-linear', saved, {})).toBe('saved-inactive');
  });
});
