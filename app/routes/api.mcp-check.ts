import type { LoaderFunctionArgs } from 'react-router';
import { getSessionServerTools } from '~/lib/.server/mcp-oauth/session-servers';
import { withSecurity } from '~/lib/security';
import { redactMcpServerTools } from '~/lib/services/mcpRedaction';
import { MCPService } from '~/lib/services/mcpService';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.mcp-check');

export const loader = withSecurity(mcpCheckLoader, {
  allowedMethods: ['GET'],
});

async function mcpCheckLoader({ request, context }: LoaderFunctionArgs) {
  try {
    const mcpService = MCPService.getInstance();
    const serverTools = await mcpService.checkServersAvailabilities();
    const sessionServers = await getSessionServerTools(request, context, { refresh: true });

    return Response.json(redactMcpServerTools({ ...serverTools, ...sessionServers }));
  } catch (error) {
    logger.error('Error checking MCP servers:', error);
    return Response.json({ error: 'Failed to check MCP servers' }, { status: 500 });
  }
}
