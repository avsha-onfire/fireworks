import type { UIMessage, UIMessageStreamWriter } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeVendor, type FakeVendor, type FakeVendorOptions } from './fake-vendor.testing';
import { completeSignIn, startSignIn } from './flow';
import { getSessionServerTools, withSessionConnectors } from './session-servers';
import { OAuthSessionStore } from './store';
import { getSignInConnector } from '~/lib/gtm/connectors';
import { MCPService } from '~/lib/services/mcpService';
import { TOOL_EXECUTION_APPROVAL, TOOL_EXECUTION_DENIED } from '~/utils/constants';

const CREDENTIALS = { clientId: 'hubspot-client-id', clientSecret: 'hubspot-client-secret-9f3c' };

const CONTEXT = {
  cloudflare: {
    env: { HUBSPOT_MCP_CLIENT_ID: CREDENTIALS.clientId, HUBSPOT_MCP_CLIENT_SECRET: CREDENTIALS.clientSecret },
  },
};

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

function vendorFor(overrides: Partial<FakeVendorOptions> = {}): FakeVendor {
  return createFakeVendor({
    serverUrl: 'https://mcp.hubspot.com',
    authorizationServer: 'https://mcp.hubspot.com',
    clientId: CREDENTIALS.clientId,
    clientSecret: CREDENTIALS.clientSecret,
    ...overrides,
  });
}

async function signIn(store: OAuthSessionStore, vendor: FakeVendor): Promise<string> {
  const session = store.createSession();

  const authorizationUrl = await startSignIn({
    store,
    sessionId: session.id,
    connector: hubspot,
    variant: hubspot.signIn.variants[0],
    credentials: CREDENTIALS,
    redirectUri: 'http://localhost:5173/api/mcp-oauth/callback',
    options: { fetchFn: vendor.fetch },
  });

  const callback = new URL(await vendor.approve(authorizationUrl));

  await completeSignIn({
    store,
    sessionId: session.id,
    state: callback.searchParams.get('state')!,
    code: callback.searchParams.get('code')!,
    credentialsFor: () => CREDENTIALS,
    options: { fetchFn: vendor.fetch },
  });

  return session.id;
}

function chatRequest(sessionId?: string): Request {
  return new Request('http://localhost:5173/api/chat', {
    method: 'POST',
    headers: sessionId ? { Cookie: `mcp_oauth_session=${sessionId}` } : {},
  });
}

function writer() {
  const writes: Array<Record<string, unknown>> = [];

  return {
    writes,
    stream: { write: (part: Record<string, unknown>) => writes.push(part) } as unknown as UIMessageStreamWriter,
  };
}

function approvedCall(toolName: string, decision: string, toolCallId = `call-${toolName}`): UIMessage[] {
  return [
    {
      id: 'assistant-1',
      role: 'assistant',
      parts: [{ type: `tool-${toolName}`, toolCallId, state: 'output-available', input: {}, output: decision }],
    } as unknown as UIMessage,
  ];
}

function outputText(output: unknown): string {
  return JSON.stringify(output);
}

describe('getSessionServerTools', () => {
  it("lists a signed-in server's tools over MCP, sending the session's token on every request", async () => {
    const store = new OAuthSessionStore();
    const vendor = vendorFor();
    const sessionId = await signIn(store, vendor);

    const servers = await getSessionServerTools(chatRequest(sessionId), CONTEXT, { store, fetchFn: vendor.fetch });
    const server = servers['gtm-hubspot'];

    expect(server.status).toBe('available');
    expect(server.config).toEqual({ type: 'streamable-http', url: 'https://mcp.hubspot.com' });
    expect(Object.keys(server.status === 'available' ? server.tools : {})).toEqual([
      'get_user_details',
      'list_deal_pipelines',
      'manage_crm_objects',
    ]);

    const token = store.getConnection(sessionId, 'gtm-hubspot')?.tokens?.accessToken;

    expect(vendor.mcpAuthorizations.length).toBeGreaterThan(0);
    expect(new Set(vendor.mcpAuthorizations)).toEqual(new Set([`Bearer ${token}`]));
  });

  it('gives a request without that session cookie nothing, and the chat the shared service unchanged', async () => {
    const store = new OAuthSessionStore();
    const vendor = vendorFor();
    const sessionId = await signIn(store, vendor);
    const otherVisitor = store.createSession().id;
    const shared = new MCPService();

    for (const request of [chatRequest(), chatRequest(otherVisitor), chatRequest(`${sessionId.slice(0, -1)}x`)]) {
      expect(await getSessionServerTools(request, CONTEXT, { store, fetchFn: vendor.fetch })).toEqual({});
      expect(await withSessionConnectors(shared, request, CONTEXT, { store, fetchFn: vendor.fetch })).toBe(shared);
    }

    expect(vendor.mcpAuthorizations).toHaveLength(0);
  });

  it('shows a connection that needs a new sign-in as unavailable, with a message to show', async () => {
    const store = new OAuthSessionStore();
    const vendor = vendorFor();
    const sessionId = await signIn(store, vendor);

    vendor.expireAccessTokens();
    vendor.revokeRefreshTokens();

    const servers = await getSessionServerTools(chatRequest(sessionId), CONTEXT, { store, fetchFn: vendor.fetch });

    expect(servers['gtm-hubspot']).toMatchObject({
      status: 'unavailable',
      error: 'Sign in to HubSpot again in Settings, Data connectors.',
    });
    expect(store.getConnection(sessionId, 'gtm-hubspot')?.status).toBe('needs-sign-in');

    for (const secret of vendor.secrets()) {
      expect(logs.join('\n')).not.toContain(secret);
    }
  });
});

describe('withSessionConnectors (the chat view)', () => {
  it("adds the session's tools, keeps disabled ones out and names their server", async () => {
    const store = new OAuthSessionStore();
    const vendor = vendorFor();
    const sessionId = await signIn(store, vendor);

    const view = await withSessionConnectors(new MCPService(), chatRequest(sessionId), CONTEXT, {
      store,
      fetchFn: vendor.fetch,
    });

    const tools = view.getToolsWithoutExecute();

    expect(Object.keys(tools)).toEqual(['get_user_details', 'list_deal_pipelines', 'manage_crm_objects']);
    expect(Object.values(tools).every((tool) => tool.execute === undefined)).toBe(true);
    expect(Object.keys(view.getToolsWithoutExecute({ disabledTools: ['manage_crm_objects'] }))).toEqual([
      'get_user_details',
      'list_deal_pipelines',
    ]);
    expect(view.getToolsWithoutExecute({ disabledServers: ['gtm-hubspot'] })).toEqual({});
    expect(view.getToolServerName('list_deal_pipelines')).toBe('gtm-hubspot');

    const { writes, stream } = writer();

    view.processToolCall({ toolCallId: 'call-1', toolName: 'list_deal_pipelines' }, stream);

    expect(writes).toEqual([
      {
        type: 'data-toolCall',
        data: {
          toolCallId: 'call-1',
          serverName: 'gtm-hubspot',
          toolName: 'list_deal_pipelines',
          toolDescription: 'Deal pipelines and their stages.',
        },
      },
    ]);
  });

  it('runs an approved call and returns the deal pipelines and stages', async () => {
    const store = new OAuthSessionStore();
    const vendor = vendorFor();
    const sessionId = await signIn(store, vendor);

    const view = await withSessionConnectors(new MCPService(), chatRequest(sessionId), CONTEXT, {
      store,
      fetchFn: vendor.fetch,
    });

    const { writes, stream } = writer();

    const [message] = await view.processToolInvocations(
      approvedCall('list_deal_pipelines', TOOL_EXECUTION_APPROVAL.APPROVE),
      stream,
    );

    const output = (message.parts[0] as { output: unknown }).output;

    expect(vendor.toolCalls).toEqual(['list_deal_pipelines']);
    expect(outputText(output)).toContain('Sales Pipeline');
    expect(outputText(output)).toContain('Closed won');
    expect(outputText(output)).toContain('Renewals');
    expect(writes).toEqual([{ type: 'tool-output-available', toolCallId: 'call-list_deal_pipelines', output }]);
  });

  it('does not run a rejected call or a call to a tool the user turned off', async () => {
    const store = new OAuthSessionStore();
    const vendor = vendorFor();
    const sessionId = await signIn(store, vendor);

    const view = await withSessionConnectors(new MCPService(), chatRequest(sessionId), CONTEXT, {
      store,
      fetchFn: vendor.fetch,
    });

    const rejected = await view.processToolInvocations(
      approvedCall('manage_crm_objects', TOOL_EXECUTION_APPROVAL.REJECT),
      writer().stream,
    );
    const turnedOff = await view.processToolInvocations(
      approvedCall('manage_crm_objects', TOOL_EXECUTION_APPROVAL.APPROVE),
      writer().stream,
      { disabledTools: ['manage_crm_objects'] },
    );

    expect((rejected[0].parts[0] as { output: unknown }).output).toBe(TOOL_EXECUTION_DENIED);
    expect((turnedOff[0].parts[0] as { output: unknown }).output).toBe(TOOL_EXECUTION_DENIED);
    expect(vendor.toolCalls).toEqual([]);
  });

  it('refreshes an expired access token and retries the call once', async () => {
    const store = new OAuthSessionStore();
    const vendor = vendorFor({ rotateRefreshTokens: true });
    const sessionId = await signIn(store, vendor);

    const view = await withSessionConnectors(new MCPService(), chatRequest(sessionId), CONTEXT, {
      store,
      fetchFn: vendor.fetch,
    });

    const before = store.getConnection(sessionId, 'gtm-hubspot')?.tokens;

    vendor.expireAccessTokens();

    const [message] = await view.processToolInvocations(
      approvedCall('get_user_details', TOOL_EXECUTION_APPROVAL.APPROVE),
      writer().stream,
    );

    const after = store.getConnection(sessionId, 'gtm-hubspot')?.tokens;

    expect(outputText((message.parts[0] as { output: unknown }).output)).toContain('rep@example.com');
    expect(vendor.tokenRequests.filter((params) => params.get('grant_type') === 'refresh_token')).toHaveLength(1);
    expect(after?.accessToken).not.toBe(before?.accessToken);
    expect(after?.refreshToken).not.toBe(before?.refreshToken);
    expect(vendor.mcpAuthorizations.at(-1)).toBe(`Bearer ${after?.accessToken}`);
  });

  it('leaves out a tool whose name a shared server or a built-in tool already uses', async () => {
    const store = new OAuthSessionStore();
    const vendor = vendorFor({ extraToolNames: ['web_search', 'agent_plan'] });
    const sessionId = await signIn(store, vendor);

    const shared = {
      isValidToolName: (name: string) => name === 'get_user_details',
      getToolServerName: (name: string) => (name === 'get_user_details' ? 'crm' : undefined),
      getToolsWithoutExecute: () => ({ get_user_details: { description: 'From the shared CRM server.' } }),
      processToolCall: vi.fn(),
      processToolInvocations: async (messages: UIMessage[]) => messages,
    } as unknown as MCPService;

    const view = await withSessionConnectors(shared, chatRequest(sessionId), CONTEXT, {
      store,
      fetchFn: vendor.fetch,
    });

    const tools = view.getToolsWithoutExecute();

    expect(Object.keys(tools).sort()).toEqual(['get_user_details', 'list_deal_pipelines', 'manage_crm_objects']);
    expect(tools.get_user_details.description).toBe('From the shared CRM server.');
    expect(view.getToolServerName('get_user_details')).toBe('crm');
    expect(logs.join('\n')).toContain(
      'Tool "web_search" from gtm-hubspot is left out: a built-in tool already uses that name.',
    );
    expect(logs.join('\n')).toContain('Tool "get_user_details" from gtm-hubspot is left out: MCP server "crm"');
  });

  it('never logs a token, a refresh token or the client secret', async () => {
    const store = new OAuthSessionStore();
    const vendor = vendorFor();
    const sessionId = await signIn(store, vendor);

    const view = await withSessionConnectors(new MCPService(), chatRequest(sessionId), CONTEXT, {
      store,
      fetchFn: vendor.fetch,
    });

    vendor.expireAccessTokens();
    await view.processToolInvocations(
      approvedCall('list_deal_pipelines', TOOL_EXECUTION_APPROVAL.APPROVE),
      writer().stream,
    );
    vendor.expireAccessTokens();
    vendor.revokeRefreshTokens();
    await view.processToolInvocations(
      approvedCall('get_user_details', TOOL_EXECUTION_APPROVAL.APPROVE),
      writer().stream,
    );

    const logged = logs.join('\n');

    expect(logged).toContain('get_user_details');

    for (const secret of vendor.secrets()) {
      expect(logged).not.toContain(secret);
    }
  });
});
