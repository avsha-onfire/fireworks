import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { FetchLike } from '@modelcontextprotocol/sdk/shared/transport.js';

/*
 * Test-only stand-in for a vendor: protected resource metadata, authorization
 * server metadata, a token endpoint that checks PKCE, the client secret and
 * the resource indicator, and an MCP endpoint (the MCP SDK's own server) that
 * accepts only access tokens it issued. Not imported by application code.
 */

export const DEAL_PIPELINES = [
  {
    id: 'default',
    label: 'Sales Pipeline',
    stages: ['Appointment scheduled', 'Qualified to buy', 'Contract sent', 'Closed won', 'Closed lost'],
  },
  { id: 'renewals', label: 'Renewals', stages: ['Upcoming', 'In negotiation', 'Renewed', 'Churned'] },
];

export interface FakeVendorOptions {
  serverUrl: string;
  authorizationServer: string;

  /** `oidc` serves OpenID Connect discovery only, as Salesforce does. */
  discovery?: 'oauth' | 'oidc';
  clientId: string;

  /** When set, every token request must carry it (client_secret_post). */
  clientSecret?: string;
  scopesSupported?: string[];
  accessTokenTtlSeconds?: number;
  rotateRefreshTokens?: boolean;

  /** Merged into the published metadata, to model a server that does not match its docs. */
  metadata?: Record<string, unknown>;
  resourceMetadata?: Record<string, unknown>;

  /** More tools, each answering `{ tool: name }`, to test name clashes. */
  extraToolNames?: string[];
}

interface IssuedCode {
  clientId: string;
  redirectUri: string;
  challenge: string;
}

async function s256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));

  let binary = '';

  for (const byte of new Uint8Array(digest)) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

function text(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] };
}

export function createFakeVendor(options: FakeVendorOptions) {
  const server = new URL(options.serverUrl);
  const issuer = new URL(options.authorizationServer);
  const oidc = options.discovery === 'oidc';

  const prmUrl = new URL(
    `/.well-known/oauth-protected-resource${server.pathname === '/' ? '' : server.pathname}`,
    server,
  ).href;

  const authorizeUrl = new URL(oidc ? '/services/oauth2/authorize' : '/oauth/authorize', issuer).href;
  const tokenUrl = new URL(oidc ? '/services/oauth2/token' : '/oauth/token', issuer).href;

  const codes = new Map<string, IssuedCode>();
  const accessTokens = new Set<string>();
  const refreshTokens = new Set<string>();
  const secrets = new Set<string>(options.clientSecret ? [options.clientSecret] : []);
  const tokenRequests: URLSearchParams[] = [];
  const mcpAuthorizations: Array<string | null> = [];
  const toolCalls: string[] = [];

  let sequence = 0;
  let refreshFailureStatus: number | undefined;

  const mint = (prefix: string) => {
    const value = `${prefix}-${++sequence}-${crypto.randomUUID()}`;

    secrets.add(value);

    return value;
  };

  const issueTokens = (previousRefreshToken?: string) => {
    const accessToken = mint('access');

    let refreshToken = previousRefreshToken;

    accessTokens.add(accessToken);

    if (!refreshToken || options.rotateRefreshTokens) {
      if (refreshToken) {
        refreshTokens.delete(refreshToken);
      }

      refreshToken = mint('refresh');
      refreshTokens.add(refreshToken);
    }

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'bearer',
      expires_in: options.accessTokenTtlSeconds ?? 1800,
    };
  };

  const authorizationServerMetadata = {
    issuer: options.authorizationServer,
    authorization_endpoint: authorizeUrl,
    token_endpoint: tokenUrl,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: options.clientSecret ? ['client_secret_post'] : ['none'],
    code_challenge_methods_supported: ['S256'],
    ...(oidc
      ? {
          jwks_uri: new URL('/id/keys', issuer).href,
          subject_types_supported: ['public'],
          id_token_signing_alg_values_supported: ['RS256'],
        }
      : {}),
    ...options.metadata,
  };

  async function handleToken(request: Request): Promise<Response> {
    const params = new URLSearchParams(await request.text());

    tokenRequests.push(params);

    if (params.get('client_id') !== options.clientId) {
      return json({ error: 'invalid_client' }, 401);
    }

    if (options.clientSecret && params.get('client_secret') !== options.clientSecret) {
      return json({ error: 'invalid_client' }, 401);
    }

    if (params.get('resource') !== options.serverUrl) {
      return json({ error: 'invalid_target' }, 400);
    }

    if (params.get('grant_type') === 'authorization_code') {
      const code = params.get('code') ?? '';
      const issued = codes.get(code);
      const verifier = params.get('code_verifier') ?? '';

      codes.delete(code);
      secrets.add(verifier);

      if (!issued || issued.redirectUri !== params.get('redirect_uri') || (await s256(verifier)) !== issued.challenge) {
        return json({ error: 'invalid_grant' }, 400);
      }

      return json(issueTokens());
    }

    if (params.get('grant_type') === 'refresh_token') {
      if (refreshFailureStatus !== undefined) {
        return json({ error: 'temporarily_unavailable' }, refreshFailureStatus);
      }

      const refreshToken = params.get('refresh_token') ?? '';

      if (!refreshTokens.has(refreshToken)) {
        return json({ error: 'invalid_grant' }, 400);
      }

      return json(issueTokens(refreshToken));
    }

    return json({ error: 'unsupported_grant_type' }, 400);
  }

  async function handleMcp(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response(null, { status: 405 });
    }

    const authorization = request.headers.get('authorization');
    const token = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : '';

    mcpAuthorizations.push(authorization);

    if (!accessTokens.has(token)) {
      return json({ error: 'invalid_token' }, 401, { 'WWW-Authenticate': `Bearer resource_metadata="${prmUrl}"` });
    }

    const mcp = new McpServer({ name: 'fake-vendor', version: '1.0.0' });

    mcp.registerTool(
      'get_user_details',
      { description: 'The signed-in user and account.', annotations: { readOnlyHint: true } },
      async () => {
        toolCalls.push('get_user_details');
        return text({ user: 'rep@example.com', accountId: 1234 });
      },
    );
    mcp.registerTool(
      'list_deal_pipelines',
      { description: 'Deal pipelines and their stages.', annotations: { readOnlyHint: true } },
      async () => {
        toolCalls.push('list_deal_pipelines');
        return text(DEAL_PIPELINES);
      },
    );
    mcp.registerTool(
      'manage_crm_objects',
      { description: 'Create or update CRM records.', annotations: { readOnlyHint: false } },
      async () => {
        toolCalls.push('manage_crm_objects');
        return text({ updated: true });
      },
    );

    for (const name of options.extraToolNames ?? []) {
      mcp.registerTool(name, { description: `Extra tool ${name}.` }, async () => {
        toolCalls.push(name);
        return text({ tool: name });
      });
    }

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    await mcp.connect(transport);

    return transport.handleRequest(request);
  }

  const fetchFn: FetchLike = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const target = `${url.origin}${url.pathname}`;

    if (request.method === 'GET' && target === prmUrl) {
      return json({
        resource: options.serverUrl,
        authorization_servers: [options.authorizationServer],
        scopes_supported: options.scopesSupported ?? [],
        ...options.resourceMetadata,
      });
    }

    if (request.method === 'GET' && url.origin === issuer.origin) {
      if (url.pathname === '/.well-known/oauth-authorization-server' && !oidc) {
        return json(authorizationServerMetadata);
      }

      if (url.pathname === '/.well-known/openid-configuration' && oidc) {
        return json(authorizationServerMetadata);
      }
    }

    if (request.method === 'POST' && target === tokenUrl) {
      return handleToken(request);
    }

    if (target === server.href) {
      return handleMcp(request);
    }

    return new Response('Not found', { status: 404 });
  };

  return {
    fetch: fetchFn,
    authorizeUrl,
    tokenRequests,
    mcpAuthorizations,
    toolCalls,

    /** Every token, code, verifier and secret this vendor has seen or issued. */
    secrets: () => [...secrets],

    /**
     * The user approves (or refuses) at the vendor: returns the URL the
     * vendor redirects the browser to.
     */
    async approve(authorizationUrl: string, { deny = false } = {}): Promise<string> {
      const url = new URL(authorizationUrl);
      const params = url.searchParams;

      if (`${url.origin}${url.pathname}` !== authorizeUrl) {
        throw new Error(`Unexpected authorization endpoint ${url.origin}${url.pathname}`);
      }

      if (
        params.get('response_type') !== 'code' ||
        params.get('code_challenge_method') !== 'S256' ||
        params.get('client_id') !== options.clientId
      ) {
        throw new Error('Malformed authorization request');
      }

      const redirect = new URL(params.get('redirect_uri') ?? '');
      const state = params.get('state');

      if (deny) {
        redirect.searchParams.set('error', 'access_denied');
      } else {
        const code = mint('code');

        codes.set(code, {
          clientId: options.clientId,
          redirectUri: params.get('redirect_uri') ?? '',
          challenge: params.get('code_challenge') ?? '',
        });
        redirect.searchParams.set('code', code);
      }

      if (state) {
        redirect.searchParams.set('state', state);
      }

      return redirect.href;
    },

    /** Every access token issued so far stops working, as when it expires. */
    expireAccessTokens: () => accessTokens.clear(),

    /** Every refresh token stops working, as when the user revokes the app. */
    revokeRefreshTokens: () => refreshTokens.clear(),

    /** Refresh requests fail with this HTTP status until called with undefined. */
    failRefreshes: (status: number | undefined) => {
      refreshFailureStatus = status;
    },
  };
}

export type FakeVendor = ReturnType<typeof createFakeVendor>;
