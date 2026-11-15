# Vendor sign-in (OAuth) for MCP connectors

Lets a Fireworks user connect an MCP server that only accepts OAuth, starting with HubSpot and Salesforce. This note is the design; the code in this folder follows it.

## What the vendors require

Checked on 2026-11-13 against the vendor docs and the metadata each server publishes.

| | HubSpot | Salesforce |
|---|---|---|
| MCP server | `https://mcp.hubspot.com` | `https://api.salesforce.com/platform/mcp/v1/platform/sobject-reads` (sandbox: `.../v1/sandbox/platform/sobject-reads`) |
| Protected resource metadata (RFC 9728) | Yes, names `https://mcp.hubspot.com` | Yes, names `https://login.salesforce.com` (sandbox: `https://test.salesforce.com`) |
| Authorization server metadata | RFC 8414 | OpenID Connect discovery |
| PKCE | S256, required | S256 |
| Client registration | Pre-registered "MCP connector" (client ID and secret). No dynamic registration. | Pre-registered External Client App. Connected Apps are not supported. |
| Token endpoint auth | `client_secret_post` | Secret optional ("Require secret for Web Server Flow") |
| Scopes | None to choose: set by the tools and the user's permissions | `mcp_api refresh_token` |
| Read-only | Not available. Tools read and write. | Yes: the `sobject-reads` server cannot create, update or delete |

## Decisions

1. **Client registration: pre-registered, from server environment variables** (the MCP spec's first option). An administrator registers one app per deployment with each vendor and sets `HUBSPOT_MCP_CLIENT_ID`, `HUBSPOT_MCP_CLIENT_SECRET`, `SALESFORCE_MCP_CLIENT_ID` and, if the app requires it, `SALESFORCE_MCP_CLIENT_SECRET`. The client secret never reaches a browser. Neither vendor offers dynamic registration or client ID metadata documents for these servers.
2. **Tokens live in server memory, in a per-browser session.** The browser holds only a random session id in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` and `__Host-` over HTTPS). Tokens are not in local storage, settings exports, API responses or page JavaScript.
3. **A session sees only its own connections.** This server has no accounts, so the session is the boundary. A request without the cookie cannot see or use a connection. Tools from a connection are added only to that browser's chats, checks and tool lists. Key connectors stay as they are: one process-wide configuration for every visitor.
4. **One MCP client per session and connection**, cached in memory. Its fetch sets `Authorization: Bearer` from the stored token on every request, so a refreshed token is used at once.
5. **Refresh on the server, one at a time.** A token is refreshed 60 seconds before `expires_in` runs out, or once after a 401. Refreshes are single-flight per connection, so a rotated refresh token is presented once. `invalid_grant` drops the tokens and marks the connection "sign in again".
6. **The vendor's own discovery, checked against the docs.** Endpoints come from the server's metadata (RFC 9728, then RFC 8414 or OpenID Connect) through the MCP SDK. The flow stops unless the authorization server is the one the vendor documents, its endpoints are on that origin over HTTPS, and it lists S256. No endpoint is hard-coded except the MCP server URL from the docs.

## Sign-in flow

1. `POST /api/mcp-oauth/start` with `{ connectorId, variant }` (JSON only). The server creates the session if needed, runs discovery, builds the authorization URL with the SDK (`code_challenge` S256, `state`, `resource` per RFC 8707, scope), keeps the PKCE verifier server-side for 10 minutes and returns the URL.
2. The browser opens it in a pop-up, or in the same tab when pop-ups are blocked.
3. `GET /api/mcp-oauth/callback`: the pending sign-in is single-use and must belong to the session in the request's cookie, which stops a sign-in started elsewhere from landing in this browser's session. The server exchanges the code with the SDK and stores the tokens, then redirects to a result page without the code. The page tells the settings tab through a `BroadcastChannel` and closes.
4. `GET /api/mcp-oauth/status` and `POST /api/mcp-oauth/disconnect` report and remove connections. Disconnect deletes the tokens from this server; it does not revoke them at the vendor. HubSpot's metadata lists no revocation endpoint, and the SDK drops the one in Salesforce's OpenID metadata. Revoke the app's access in the vendor's settings.

## Where it plugs in

- `/api/chat` gets a request view: shared MCP tools plus this session's tools. A session tool whose name clashes with a shared or built-in tool is left out. Tool calls still need approval in the chat, and tools the user turned off are not offered.
- `/api/mcp-check` and `/api/mcp-update-config` add the session's servers to their response, config `{ type, url }` only, so the existing server lists show them.
- Settings, Data connectors lists a connected server's tools with on and off switches, and for HubSpot a button that turns off every tool not marked read-only (MCP `readOnlyHint`, a hint from the vendor).

## Files

| File | Holds |
|---|---|
| `config.ts` | App credentials from the environment, the redirect URI |
| `cookie.ts` | The session cookie |
| `store.ts` | Sessions, pending sign-ins and connections, in memory |
| `flow.ts` | Discovery and its checks, start, callback |
| `tokens.ts` | Access tokens and single-flight refresh |
| `authorized-fetch.ts` | The MCP transport's fetch: Bearer header, one retry after a 401 |
| `session-servers.ts` | Per-session MCP clients, their tools, the chat view |
| `errors.ts` | Safe error messages and redacted log text |
| `fake-vendor.testing.ts` | Test-only vendor: metadata, token endpoint, MCP server |
| `app/routes/api.mcp-oauth.$step.ts` | The four routes |
| `app/lib/gtm/connectors.ts` | `signIn` blocks for HubSpot and Salesforce |
| `app/components/gtm/ConnectorSignIn.tsx` | The settings section |

## Never in a response or a log

Access and refresh tokens, the authorization code, the PKCE verifier and the client secret. Logs name the connector and a redacted error. Tests assert this for the sign-in routes, `/api/mcp-check`, `/api/mcp-update-config`, refresh and the chat's tool calls.

## Limits

- Sign-ins are lost when the server restarts.
- One server process is assumed (`pnpm run dev`, `pnpm run preview`, Docker). On a Cloudflare Workers deployment, requests can reach different isolates, so sign-in is not reliable there.
- Not verified in the desktop app.
- HubSpot cannot be limited to reading. Approve each tool call, and turn off write tools in the chat's tool list.
