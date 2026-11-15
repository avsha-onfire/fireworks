import { getGtmInstructions } from '~/lib/gtm/prompt';
import { sanitizeGtmWorkspace } from '~/lib/gtm/workspace';

export interface GtmSystemBlockOptions {
  /** `gtmContext` exactly as it arrived in the request body: optional, unvalidated. */
  gtmContext?: unknown;
  chatMode?: string;
  promptId?: string;

  /** Names of the MCP tools offered to the model for this request. */
  mcpToolNames?: string[];

  /** The subset of `mcpToolNames` that belongs to the Browser Use connector. */
  browserUseToolNames?: string[];
}

/**
 * The GTM instructions placed at the start of the chat's extra system text.
 *
 * The workspace context is sanitised here rather than validated by the request
 * schema, so a malformed or outdated value can never fail a chat request.
 */
export function getGtmSystemBlock({
  gtmContext,
  chatMode,
  promptId,
  mcpToolNames = [],
  browserUseToolNames = [],
}: GtmSystemBlockOptions): string {
  // Browser Use tools drive a web browser; they do not read the team's CRM or warehouse.
  const browserUseTools = new Set(browserUseToolNames);

  return getGtmInstructions({
    context: sanitizeGtmWorkspace(gtmContext),

    // A missing mode is discuss mode: that is how the chat pipeline picks the base prompt.
    chatMode: chatMode === 'build' ? 'build' : 'discuss',

    // The terse prompt exists for small-context models, so it gets the short variant.
    compact: promptId === 'tiny-tim',
    hasConnectedTools: mcpToolNames.some((toolName) => !browserUseTools.has(toolName)),
  });
}
