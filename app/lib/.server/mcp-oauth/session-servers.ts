import { createMCPClient } from '@ai-sdk/mcp';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { FetchLike } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { ToolSet, UIMessage, UIMessageStreamWriter } from 'ai';
import { createAuthorizedFetch } from './authorized-fetch';
import { getServerEnv, readClientCredentials, type ClientCredentials } from './config';
import { readSessionId } from './cookie';
import { describeForLog, McpOAuthError } from './errors';
import { getOAuthStore, type OAuthConnection, type OAuthSessionStore } from './store';
import { getAccessToken, refreshAccessToken, type TokenContext } from './tokens';
import { isServerAgentTool } from '~/lib/common/agentLoop';
import { getSignInConnector } from '~/lib/gtm/connectors';
import {
  getToolCallId,
  getToolInput,
  getToolName,
  getToolOutput,
  getToolState,
  isToolPart,
} from '~/lib/persistence/messageMigration';
import { PROJECT_TOOL_NAMES } from '~/lib/runtime/projectMcp.shared';
import type {
  MCPClient,
  MCPServer,
  MCPServerTools,
  MCPService,
  StreamableHTTPServerConfig,
} from '~/lib/services/mcpService';
import type { ToolCallAnnotation } from '~/types/context';
import {
  TOOL_EXECUTION_APPROVAL,
  TOOL_EXECUTION_DENIED,
  TOOL_EXECUTION_ERROR,
  TOOL_NO_EXECUTE_FUNCTION,
} from '~/utils/constants';
import { createScopedLogger } from '~/utils/logger';

/*
 * MCP servers reached through a vendor sign-in, per browser session.
 *
 * The shared MCPService holds one configuration for every visitor. Signed-in
 * servers are kept apart from it: each session gets its own client per
 * connection, and its tools are added only to that session's requests.
 */

const logger = createScopedLogger('mcp-oauth');

const TOOLS_TTL_MS = 5 * 60 * 1000;
const CLIENT_IDLE_MS = 15 * 60 * 1000;
const CONNECT_TIMEOUT_MS = 20_000;

interface CachedClient {
  client: Promise<MCPClient>;
  signInId: string;
  tools?: ToolSet;
  toolsAt: number;
  lastUsedAt: number;
}

const CACHE_KEY = Symbol.for('mcp-oauth.session-clients');

function clientCache(): Map<string, CachedClient> {
  const holder = globalThis as unknown as Record<symbol, Map<string, CachedClient> | undefined>;

  holder[CACHE_KEY] ??= new Map();

  return holder[CACHE_KEY];
}

function cacheKey(sessionId: string, connectorId: string): string {
  return `${sessionId}\n${connectorId}`;
}

function closeQuietly(cached: CachedClient | undefined): void {
  cached?.client.then((client) => client.close()).catch(() => undefined);
}

/** Closes and forgets the client of one connection, for a disconnect. */
export function closeSessionClient(sessionId: string, connectorId: string): void {
  const cache = clientCache();
  const key = cacheKey(sessionId, connectorId);

  closeQuietly(cache.get(key));
  cache.delete(key);
}

function evictIdleClients(now: number): void {
  const cache = clientCache();

  for (const [key, cached] of cache) {
    if (now - cached.lastUsedAt > CLIENT_IDLE_MS) {
      closeQuietly(cached);
      cache.delete(key);
    }
  }
}

function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), CONNECT_TIMEOUT_MS);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function connectionSecrets(connection: OAuthConnection | undefined, credentials?: ClientCredentials) {
  return [connection?.tokens?.accessToken, connection?.tokens?.refreshToken, credentials?.clientSecret];
}

export interface SessionServerOptions {
  store?: OAuthSessionStore;
  fetchFn?: FetchLike;
  now?: () => number;

  /** Ask every server for its tools even when the cached list is fresh. */
  refresh?: boolean;
}

async function connect(connection: OAuthConnection, tokens: TokenContext, fetchFn?: FetchLike): Promise<MCPClient> {
  const transport = new StreamableHTTPClientTransport(new URL(connection.serverUrl), {
    fetch: createAuthorizedFetch({
      getToken: () => getAccessToken(tokens),
      refreshToken: (rejected) => refreshAccessToken(tokens, rejected),
      fetchFn,
    }),
  });

  const client = await createMCPClient({ transport });

  return Object.assign(client, { serverName: connection.connectorId });
}

async function loadServer(
  store: OAuthSessionStore,
  sessionId: string,
  connection: OAuthConnection,
  credentials: ClientCredentials | undefined,
  options: SessionServerOptions,
  now: number,
): Promise<MCPServer> {
  const config: StreamableHTTPServerConfig = { type: 'streamable-http', url: connection.serverUrl };
  const vendor = getSignInConnector(connection.connectorId)?.vendor ?? connection.connectorId;
  const cache = clientCache();
  const key = cacheKey(sessionId, connection.connectorId);

  let cached = cache.get(key);

  if (cached && (cached.signInId !== connection.signInId || connection.status !== 'connected')) {
    closeQuietly(cached);
    cache.delete(key);
    cached = undefined;
  }

  if (connection.status !== 'connected') {
    return {
      status: 'unavailable',
      error: `Sign in to ${vendor} again in Settings, Data connectors.`,
      client: null,
      config,
    };
  }

  const tokens: TokenContext = {
    store,
    sessionId,
    connectorId: connection.connectorId,
    credentials,
    fetchFn: options.fetchFn,
    now: options.now,
  };

  if (!cached) {
    const connecting = connect(connection, tokens, options.fetchFn);

    cached = {
      client: withTimeout(connecting, `${vendor} did not answer in time.`).catch((error: unknown) => {
        // A client that connects after the timeout is closed rather than left open.
        connecting.then((client) => client.close()).catch(() => undefined);
        throw error;
      }),
      signInId: connection.signInId,
      toolsAt: 0,
      lastUsedAt: now,
    };
    cache.set(key, cached);
  }

  const entry = cached;

  entry.lastUsedAt = now;

  try {
    const client = await entry.client;

    if (!entry.tools || options.refresh || now - entry.toolsAt > TOOLS_TTL_MS) {
      entry.tools = await withTimeout(client.tools(), `${vendor} did not list its tools in time.`);
      entry.toolsAt = now;
    }

    return { status: 'available', tools: entry.tools, client, config };
  } catch (error) {
    if (cache.get(key) === entry) {
      cache.delete(key);
    }

    closeQuietly(entry);
    logger.error(
      `${connection.connectorId}: could not connect: ${describeForLog(error, connectionSecrets(connection, credentials))}`,
    );

    return {
      status: 'unavailable',
      error: error instanceof McpOAuthError ? error.message : `Could not connect to ${vendor}. Try again in a moment.`,
      client: null,
      config,
    };
  }
}

/**
 * The signed-in servers of the request's session, keyed by connector id, in
 * the shape the MCP routes return. Empty when the request has no session.
 */
export async function getSessionServerTools(
  request: Request,
  context: unknown,
  options: SessionServerOptions = {},
): Promise<MCPServerTools> {
  const store = options.store ?? getOAuthStore();
  const session = store.getSession(readSessionId(request));

  if (!session || session.connections.size === 0) {
    return {};
  }

  const env = getServerEnv(context);
  const now = (options.now ?? Date.now)();

  evictIdleClients(now);

  const connections = [...session.connections.values()].sort((a, b) => a.connectorId.localeCompare(b.connectorId));

  const entries = await Promise.all(
    connections.map(async (connection): Promise<[string, MCPServer]> => {
      const connector = getSignInConnector(connection.connectorId);
      const credentials = connector ? readClientCredentials(connector, env) : undefined;

      return [connection.connectorId, await loadServer(store, session.id, connection, credentials, options, now)];
    }),
  );

  return Object.fromEntries(entries);
}

/** The MCPService methods the chat route calls. */
export type ChatMcpService = Pick<
  MCPService,
  'getToolsWithoutExecute' | 'getToolServerName' | 'processToolCall' | 'processToolInvocations'
>;

interface SessionTool {
  serverName: string;
  tool: ToolSet[string];
}

function isBuiltInToolName(name: string): boolean {
  return (PROJECT_TOOL_NAMES as readonly string[]).includes(name) || isServerAgentTool(name);
}

/**
 * Tool names are global in a chat request, so a signed-in server's tool is
 * left out when a shared MCP server, a built-in tool or an earlier signed-in
 * server already uses its name.
 */
function collectSessionTools(servers: MCPServerTools, shared: MCPService): Map<string, SessionTool> {
  const tools = new Map<string, SessionTool>();

  for (const [serverName, server] of Object.entries(servers)) {
    if (server.status !== 'available') {
      continue;
    }

    for (const [toolName, tool] of Object.entries(server.tools)) {
      const owner = shared.isValidToolName(toolName)
        ? `MCP server "${shared.getToolServerName(toolName) ?? 'unknown'}"`
        : isBuiltInToolName(toolName)
          ? 'a built-in tool'
          : tools.get(toolName)?.serverName;

      if (owner) {
        logger.warn(`Tool "${toolName}" from ${serverName} is left out: ${owner} already uses that name.`);
        continue;
      }

      tools.set(toolName, { serverName, tool });
    }
  }

  return tools;
}

/**
 * The shared MCP service with one session's signed-in tools added. Approval
 * works as for any MCP tool: a call runs only after the user approves it.
 */
class SessionMcpView implements ChatMcpService {
  constructor(
    private readonly _shared: MCPService,
    private readonly _tools: Map<string, SessionTool>,
    private readonly _secretsFor: (serverName: string) => Array<string | undefined>,
  ) {}

  getToolsWithoutExecute(options: { disabledServers?: string[]; disabledTools?: string[] } = {}): ToolSet {
    const disabledServers = new Set(options.disabledServers ?? []);
    const disabledTools = new Set(options.disabledTools ?? []);
    const tools: ToolSet = { ...this._shared.getToolsWithoutExecute(options) };

    for (const [toolName, { serverName, tool }] of this._tools) {
      if (!disabledTools.has(toolName) && !disabledServers.has(serverName)) {
        tools[toolName] = { ...tool, execute: undefined };
      }
    }

    return tools;
  }

  getToolServerName(toolName: string): string | undefined {
    return this._tools.get(toolName)?.serverName ?? this._shared.getToolServerName(toolName);
  }

  processToolCall(
    toolCall: { toolCallId?: string; toolName?: string; input?: unknown },
    dataStream: UIMessageStreamWriter,
  ): void {
    const sessionTool = toolCall.toolName ? this._tools.get(toolCall.toolName) : undefined;

    if (!sessionTool) {
      this._shared.processToolCall(toolCall, dataStream);
      return;
    }

    if (!toolCall.toolCallId || !toolCall.toolName) {
      return;
    }

    const description = sessionTool.tool.description;

    dataStream.write({
      type: 'data-toolCall',
      data: {
        toolCallId: toolCall.toolCallId,
        serverName: sessionTool.serverName,
        toolName: toolCall.toolName,
        toolDescription: typeof description === 'string' ? description : 'No description available',
      } as ToolCallAnnotation,
    });
  }

  async processToolInvocations(
    messages: UIMessage[],
    dataStream: UIMessageStreamWriter,
    options: { browserUseCloudEnabled?: boolean; disabledTools?: string[] } = {},
  ): Promise<UIMessage[]> {
    const processed = await this._shared.processToolInvocations(messages, dataStream, options);
    const lastMessage = processed[processed.length - 1];

    if (!lastMessage?.parts) {
      return processed;
    }

    const disabledTools = new Set(options.disabledTools ?? []);

    const parts = await Promise.all(
      lastMessage.parts.map((part) => this._processPart(part, dataStream, disabledTools)),
    );

    return [...processed.slice(0, -1), { ...lastMessage, parts }] as UIMessage[];
  }

  private async _processPart(part: unknown, dataStream: UIMessageStreamWriter, disabledTools: Set<string>) {
    const toolName = isToolPart(part) ? getToolName(part) : undefined;
    const sessionTool = toolName ? this._tools.get(toolName) : undefined;

    if (!toolName || !sessionTool || getToolState(part) !== 'output-available') {
      return part;
    }

    const toolCallId = getToolCallId(part) as string;
    const decision = getToolOutput(part);

    let result: unknown;

    if (disabledTools.has(toolName)) {
      result = TOOL_EXECUTION_DENIED;
    } else if (decision === TOOL_EXECUTION_APPROVAL.APPROVE) {
      result = await this._execute(sessionTool, toolName, getToolInput(part), toolCallId);
    } else if (decision === TOOL_EXECUTION_APPROVAL.REJECT) {
      result = TOOL_EXECUTION_DENIED;
    } else {
      return part;
    }

    dataStream.write({ type: 'tool-output-available', toolCallId, output: result });

    return { ...(part as object), output: result, state: 'output-available' };
  }

  private async _execute({ serverName, tool }: SessionTool, toolName: string, input: unknown, toolCallId: string) {
    if (typeof tool.execute !== 'function') {
      return TOOL_NO_EXECUTE_FUNCTION;
    }

    logger.debug(`calling tool "${toolName}" on ${serverName}`);

    try {
      return await tool.execute(input as never, { toolCallId, messages: [] } as never);
    } catch (error) {
      logger.error(
        `Tool "${toolName}" on ${serverName} failed: ${describeForLog(error, this._secretsFor(serverName))}`,
      );

      return error instanceof McpOAuthError ? { isError: true, error: error.message } : TOOL_EXECUTION_ERROR;
    }
  }
}

/**
 * What the chat route uses in place of `MCPService.getInstance()`: the shared
 * service itself when the request's session has no signed-in servers, or a
 * view that adds their tools.
 */
export async function withSessionConnectors(
  shared: MCPService,
  request: Request,
  context: unknown,
  options: SessionServerOptions = {},
): Promise<ChatMcpService> {
  const store = options.store ?? getOAuthStore();

  let servers: MCPServerTools;

  try {
    servers = await getSessionServerTools(request, context, { ...options, store });
  } catch (error) {
    logger.error(`Could not load signed-in connectors: ${describeForLog(error)}`);
    return shared;
  }

  const tools = collectSessionTools(servers, shared);

  if (tools.size === 0) {
    return shared;
  }

  const sessionId = readSessionId(request);
  const env = getServerEnv(context);

  const secretsFor = (serverName: string) => {
    const connector = getSignInConnector(serverName);
    const connection = sessionId ? store.getConnection(sessionId, serverName) : undefined;

    return connectionSecrets(connection, connector ? readClientCredentials(connector, env) : undefined);
  };

  return new SessionMcpView(shared, tools, secretsFor);
}
