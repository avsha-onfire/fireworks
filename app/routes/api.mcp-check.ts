import { withSecurity } from '~/lib/security';
import { redactMcpServerTools } from '~/lib/services/mcpRedaction';
import { MCPService } from '~/lib/services/mcpService';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.mcp-check');

export const loader = withSecurity(mcpCheckLoader, {
  allowedMethods: ['GET'],
});

async function mcpCheckLoader() {
  try {
    const mcpService = MCPService.getInstance();
    const serverTools = await mcpService.checkServersAvailabilities();

    return Response.json(redactMcpServerTools(serverTools));
  } catch (error) {
    logger.error('Error checking MCP servers:', error);
    return Response.json({ error: 'Failed to check MCP servers' }, { status: 500 });
  }
}
