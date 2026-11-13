import type { UIMessage } from 'ai';
import type { ActionFunctionArgs } from 'react-router';
import { toApiErrorResponse, toMissingCredentialError } from '~/lib/.server/api/errors';
import { readJsonBody } from '~/lib/.server/api/read-body';
import { REQUEST_LIMITS, enhancerRequestSchema, parseBody } from '~/lib/.server/api/schemas';
import { streamText } from '~/lib/.server/llm/stream-text';
import { getApiKeysFromCookie, getProviderSettingsFromCookie } from '~/lib/api/cookies';
import { GTM_ENHANCER_SYSTEM, getGtmEnhancerPrompt } from '~/lib/gtm/prompt';
import { sanitizeGtmWorkspace } from '~/lib/gtm/workspace';
import { createMessage } from '~/lib/persistence/messageMigration';

export async function action(args: ActionFunctionArgs) {
  return enhancerAction(args);
}

async function enhancerAction({ context, request }: ActionFunctionArgs) {
  /*
   * `provider` used to be destructured from an unvalidated body, so `{ provider: {} }`
   * threw a TypeError reading `.name` and surfaced as a 500. Validated up front now.
   */
  let body;

  try {
    const rawBody = await readJsonBody(request, { maxBytes: REQUEST_LIMITS.MAX_LLMCALL_BODY_BYTES });

    body = parseBody(enhancerRequestSchema, rawBody, 'enhancer');
  } catch (error) {
    return toApiErrorResponse(error);
  }

  const { message, model } = body;
  const providerName = body.provider.name;

  const cookieHeader = request.headers.get('Cookie');
  const apiKeys = getApiKeysFromCookie(cookieHeader);
  const providerSettings = getProviderSettingsFromCookie(cookieHeader);

  try {
    const result = await streamText({
      messages: [
        createMessage({
          role: 'user',
          text:
            `[Model: ${model}]\n\n[Provider: ${providerName}]\n\n` +
            getGtmEnhancerPrompt(message, sanitizeGtmWorkspace(body.gtmContext)),
        }) as unknown as Omit<UIMessage, 'id'>,
      ],
      env: context.cloudflare?.env as any,
      apiKeys,
      providerSettings,
      options: {
        system: GTM_ENHANCER_SYSTEM,

        /*
         * onError: (event) => {
         *   throw new Response(null, {
         *     status: 500,
         *     statusText: 'Internal Server Error',
         *   });
         * }
         */
      },
    });

    // Return the text stream directly since it's already text data
    return new Response(result.textStream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        Connection: 'keep-alive',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message?.includes('API key')) {
      return toApiErrorResponse(toMissingCredentialError(providerName, error.message));
    }

    return toApiErrorResponse(error, providerName);
  }
}
