import type { ActionFunctionArgs } from 'react-router';
import { withSecurity } from '~/lib/security';
import { redactMcpServerTools } from '~/lib/services/mcpRedaction';
import { MCPService, type MCPConfig } from '~/lib/services/mcpService';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.mcp-update-config');

export const action = withSecurity(mcpUpdateConfigAction, {
  allowedMethods: ['POST'],
});

function isJsonRequest(request: Request) {
  const mediaType = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();

  return mediaType === 'application/json';
}

async function mcpUpdateConfigAction({ request }: ActionFunctionArgs) {
  /*
   * A browser sends form and text/plain POSTs to another origin without a
   * preflight. Requiring JSON keeps a page on another site from replacing this
   * server's MCP configuration through a visitor's browser.
   */
  if (!isJsonRequest(request)) {
    return Response.json({ error: 'Content-Type must be application/json' }, { status: 415 });
  }

  try {
    const mcpConfig = (await request.json()) as MCPConfig;

    if (!mcpConfig || typeof mcpConfig !== 'object') {
      return Response.json({ error: 'Invalid MCP servers configuration' }, { status: 400 });
    }

    const mcpService = MCPService.getInstance();
    const serverTools = await mcpService.updateConfig(mcpConfig);

    return Response.json(redactMcpServerTools(serverTools));
  } catch (error) {
    logger.error('Error updating MCP config:', error);
    return Response.json({ error: 'Failed to update MCP config' }, { status: 500 });
  }
}
