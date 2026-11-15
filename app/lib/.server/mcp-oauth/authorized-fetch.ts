import type { FetchLike } from '@modelcontextprotocol/sdk/shared/transport.js';
import { defaultFetch } from './flow';

export interface AuthorizedFetchOptions {
  /** The access token to send now. */
  getToken: () => Promise<string>;

  /** A fresh token in place of one the server rejected. */
  refreshToken: (rejected: string) => Promise<string>;
  fetchFn?: FetchLike;
}

/**
 * The fetch used by the MCP transport of a signed-in connection. Every
 * request carries the current access token as `Authorization: Bearer`, as the
 * MCP spec requires, so a refreshed token takes effect on the next request. A
 * 401 is retried once with a refreshed token; a second 401 is returned to the
 * transport, which reports the server as unavailable.
 *
 * The token lives only in the request headers sent to the vendor, never in
 * the transport's options, so serialising the transport or its config cannot
 * reveal it.
 */
export function createAuthorizedFetch({
  getToken,
  refreshToken,
  fetchFn = defaultFetch,
}: AuthorizedFetchOptions): FetchLike {
  return async (url, init) => {
    const send = (token: string) => {
      const headers = new Headers(init?.headers);

      headers.set('Authorization', `Bearer ${token}`);

      return fetchFn(url, { ...init, headers });
    };

    const token = await getToken();
    const response = await send(token);

    if (response.status !== 401) {
      return response;
    }

    await response.body?.cancel().catch(() => undefined);

    return send(await refreshToken(token));
  };
}
