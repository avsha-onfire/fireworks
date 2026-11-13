import { parseCookies } from '~/lib/api/cookies';

/*
 * The browser's only handle on its sign-ins: a random session id. HttpOnly
 * keeps it from page scripts, including apps previewed in the builder.
 * SameSite=Lax keeps it off cross-site requests except top-level navigations,
 * which the vendor's redirect back to the callback is. Over HTTPS the
 * `__Host-` prefix also stops a sibling subdomain from setting it.
 */

const COOKIE_NAME = 'mcp_oauth_session';
const SECURE_COOKIE_NAME = `__Host-${COOKIE_NAME}`;
const SESSION_ID = /^[A-Za-z0-9_-]{43}$/;

export const SESSION_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function isHttps(request: Request): boolean {
  return new URL(request.url).protocol === 'https:';
}

/** The session id in the request's cookie, when it has the shape this server issues. */
export function readSessionId(request: Request): string | undefined {
  const cookies = parseCookies(request.headers.get('Cookie'));
  const value = cookies[isHttps(request) ? SECURE_COOKIE_NAME : COOKIE_NAME];

  return value && SESSION_ID.test(value) ? value : undefined;
}

export function sessionCookieHeader(request: Request, sessionId: string): string {
  const secure = isHttps(request);

  return [
    `${secure ? SECURE_COOKIE_NAME : COOKIE_NAME}=${sessionId}`,
    'Path=/',
    `Max-Age=${SESSION_COOKIE_MAX_AGE_SECONDS}`,
    'HttpOnly',
    'SameSite=Lax',
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}
