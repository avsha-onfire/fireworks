import type { GtmConnector } from './connectors';
import { isServerAgentTool } from '~/lib/common/agentLoop';
import { PROJECT_TOOL_NAMES } from '~/lib/runtime/projectMcp.shared';
import type { MCPConfig, MCPServerTools } from '~/lib/services/mcpService';
import { useMCPStore } from '~/lib/stores/mcp';

/*
 * Adds and removes catalog connectors in the browser's MCP settings.
 *
 * The MCP store has two traps that would lose a user's saved servers: after a
 * failed load it holds default settings while reporting an error, and it
 * ignores a save while another one is running. Both are refused here before
 * anything is written.
 */

export type GtmConnectorState = 'not-added' | 'active' | 'saved-inactive';

type McpSettings = ReturnType<typeof useMCPStore.getState>['settings'];

async function loadWritableSettings(): Promise<McpSettings> {
  await useMCPStore.getState().initialize();

  const store = useMCPStore.getState();

  if (store.error) {
    throw new Error(
      `Your saved connector settings could not be loaded, so nothing was changed. Reload the page and try again. (${store.error})`,
    );
  }

  if (store.isUpdatingConfig) {
    throw new Error('Connector settings are still being saved. Try again in a moment.');
  }

  return store.settings;
}

function withServers(settings: McpSettings, mcpServers: MCPConfig['mcpServers']): McpSettings {
  return { ...settings, mcpConfig: { ...settings.mcpConfig, mcpServers } };
}

function isBuiltInToolName(name: string): boolean {
  return (PROJECT_TOOL_NAMES as readonly string[]).includes(name) || isServerAgentTool(name);
}

/**
 * Why a freshly added server cannot stay, or `null` when it is usable.
 *
 * Tool names are global on the server: a name shared with another MCP server
 * silently reroutes that tool to whichever server registered last, and a name
 * shared with a built-in tool makes every chat request fail.
 */
function findProblem(connector: GtmConnector, serverTools: MCPServerTools): string | null {
  const server = serverTools[connector.id];

  if (server?.status !== 'available') {
    const detail = server?.error ? ` (${server.error})` : '';

    return `${connector.name} could not connect with these details${detail}.`;
  }

  const toolNames = Object.keys(server.tools);
  const builtInClash = toolNames.find(isBuiltInToolName);

  if (builtInClash) {
    return `${connector.name} offers a tool named "${builtInClash}", which is also the name of a built-in tool.`;
  }

  for (const [otherName, otherServer] of Object.entries(serverTools)) {
    if (otherName === connector.id || otherServer.status !== 'available') {
      continue;
    }

    const clash = toolNames.find((name) => Object.hasOwn(otherServer.tools, name));

    if (clash) {
      return `${connector.name} offers a tool named "${clash}", which your MCP server "${otherName}" already provides.`;
    }
  }

  return null;
}

/**
 * Saves the connector as an MCP server and keeps it only if the vendor accepts
 * the connection and its tools do not collide with existing ones. Throws an
 * Error with a user-facing message otherwise; the previous settings are
 * restored first.
 */
export async function addGtmConnector(connector: GtmConnector, values: Record<string, string>): Promise<void> {
  if (connector.auth !== 'token') {
    throw new Error(`${connector.name} needs vendor sign-in, which is not available yet.`);
  }

  const config = connector.buildConfig(values);
  const previousSettings = await loadWritableSettings();
  const { updateSettings } = useMCPStore.getState();

  try {
    await updateSettings(
      withServers(previousSettings, { ...previousSettings.mcpConfig.mcpServers, [connector.id]: config }),
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);

    throw new Error(`${connector.name} was not added because the connector settings could not be saved (${detail}).`);
  }

  const problem = findProblem(connector, useMCPStore.getState().serverTools);

  if (!problem) {
    return;
  }

  try {
    await updateSettings(previousSettings);
  } catch {
    throw new Error(
      `${problem} It could not be removed again automatically: delete "${connector.id}" from the MCP configuration JSON and save.`,
    );
  }

  throw new Error(`${problem} The connector was not added.`);
}

/** Removes a catalog connector; does nothing when it is not saved. */
export async function removeGtmConnector(id: string): Promise<void> {
  const settings = await loadWritableSettings();
  const { [id]: removed, ...mcpServers } = settings.mcpConfig.mcpServers;

  if (!removed) {
    return;
  }

  await useMCPStore.getState().updateSettings(withServers(settings, mcpServers));
}

/**
 * `active` needs both the saved entry and a live connection on the server: the
 * server holds one configuration for everyone who uses it, so a saved entry
 * can be replaced there by another browser.
 */
export function getGtmConnectorState(
  id: string,
  settings: { mcpConfig: MCPConfig },
  serverTools: MCPServerTools,
): GtmConnectorState {
  if (!Object.hasOwn(settings.mcpConfig.mcpServers, id)) {
    return 'not-added';
  }

  return serverTools[id]?.status === 'available' ? 'active' : 'saved-inactive';
}
