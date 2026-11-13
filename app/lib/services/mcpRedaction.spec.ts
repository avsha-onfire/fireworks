import { describe, expect, it } from 'vitest';
import { REDACTED_VALUE, redactErrorText, redactMcpServerTools } from './mcpRedaction';
import type { MCPClient, MCPServerTools } from './mcpService';

const HEADER_SECRET = 'Bearer crm-token-1f9a';
const ENV_SECRET = 'warehouse-password-55e3';
const CLIENT_SECRET = 'transport-token-90bd';

/** Like the real client, the fake keeps a transport that carries the request headers. */
function clientHolding(secret: string): MCPClient {
  return {
    serverName: 'fake',
    tools: async () => ({}),
    close: async () => undefined,
    transport: { headers: { Authorization: secret } },
  } as unknown as MCPClient;
}

function serverTools(): MCPServerTools {
  return {
    crm: {
      status: 'available',
      client: clientHolding(CLIENT_SECRET),
      tools: { lookup_account: { description: 'Find an account by name' } } as never,
      config: {
        type: 'streamable-http',
        url: 'https://mcp.crm.example/mcp',
        headers: { Authorization: HEADER_SECRET, 'X-Workspace': 'acme' },
      },
    },
    warehouse: {
      status: 'unavailable',
      error: 'could not connect to server',
      client: null,
      config: {
        type: 'stdio',
        command: 'warehouse-mcp',
        args: ['--read-only'],
        cwd: '/srv/warehouse',
        env: { WAREHOUSE_PASSWORD: ENV_SECRET },
      },
    },
  };
}

describe('redactMcpServerTools', () => {
  it('masks every header value and keeps what the server list displays', () => {
    const { crm } = redactMcpServerTools(serverTools());

    expect(crm).toEqual({
      status: 'available',
      tools: { lookup_account: { description: 'Find an account by name' } },
      config: {
        type: 'streamable-http',
        url: 'https://mcp.crm.example/mcp',
        headers: { Authorization: REDACTED_VALUE, 'X-Workspace': REDACTED_VALUE },
      },
    });
  });

  it('masks every environment value and keeps the command line and the error', () => {
    const { warehouse } = redactMcpServerTools(serverTools());

    expect(warehouse).toEqual({
      status: 'unavailable',
      error: 'could not connect to server',
      config: {
        type: 'stdio',
        command: 'warehouse-mcp',
        args: ['--read-only'],
        env: { WAREHOUSE_PASSWORD: REDACTED_VALUE },
      },
    });
  });

  it('drops the client handle, which holds the transport and its headers', () => {
    const redacted = redactMcpServerTools(serverTools());

    expect(redacted.crm).not.toHaveProperty('client');
    expect(redacted.warehouse).not.toHaveProperty('client');
    expect(JSON.stringify(redacted)).not.toContain(CLIENT_SECRET);
  });

  it('serialises without any secret', () => {
    const payload = JSON.stringify(redactMcpServerTools(serverTools()));

    expect(payload).not.toContain(HEADER_SECRET);
    expect(payload).not.toContain(ENV_SECRET);
    expect(payload).not.toContain('acme');
  });

  it('masks header and environment values quoted in the error of an unavailable server', () => {
    const input = serverTools();

    Object.assign(input.crm, {
      status: 'unavailable',
      error: `Headers.append: "${HEADER_SECRET}" is an invalid header value.`,
    });
    Object.assign(input.warehouse, { error: `spawn failed with WAREHOUSE_PASSWORD=${ENV_SECRET}` });

    const redacted = redactMcpServerTools(input);

    expect(redacted.crm).toMatchObject({
      status: 'unavailable',
      error: `Headers.append: "${REDACTED_VALUE}" is an invalid header value.`,
    });
    expect(redacted.warehouse).toMatchObject({ error: `spawn failed with WAREHOUSE_PASSWORD=${REDACTED_VALUE}` });
    expect(JSON.stringify(redacted)).not.toContain(HEADER_SECRET);
    expect(JSON.stringify(redacted)).not.toContain(ENV_SECRET);
    expect(input.crm).toHaveProperty('error', `Headers.append: "${HEADER_SECRET}" is an invalid header value.`);
  });

  it('masks a value stored with surrounding whitespace, and the longer of two overlapping values whole', () => {
    const input = {
      padded: {
        status: 'unavailable',
        error: 'rejected "key-7c41" and "key-7c41-extended"',
        client: null,
        config: {
          type: 'sse',
          url: 'https://events.example/sse',
          headers: { 'X-Key': ' key-7c41\n', 'X-Long-Key': 'key-7c41-extended', 'X-Empty': '  ' },
        },
      },
    } as unknown as MCPServerTools;

    expect(redactMcpServerTools(input).padded).toMatchObject({
      error: `rejected "${REDACTED_VALUE}" and "${REDACTED_VALUE}"`,
    });
  });

  it('keeps an error that quotes no configured value, and tolerates a missing one', () => {
    const input = serverTools();

    expect(redactMcpServerTools(input).warehouse).toMatchObject({ error: 'could not connect to server' });

    Object.assign(input.warehouse, { error: undefined });

    expect(redactMcpServerTools(input).warehouse).toMatchObject({ error: '' });
  });

  it('leaves the service copy untouched so it can still connect', () => {
    const original = serverTools();
    const redacted = redactMcpServerTools(original);

    expect(original.crm.config).toEqual(serverTools().crm.config);
    expect(original.warehouse.config).toEqual(serverTools().warehouse.config);
    expect(redacted.crm.config).not.toBe(original.crm.config);
    expect(redacted.warehouse.config.args).not.toBe((original.warehouse.config as { args: string[] }).args);
  });

  it('does not copy fields it does not know', () => {
    const input = serverTools();

    Object.assign(input.crm.config, { token: HEADER_SECRET, auth: { password: ENV_SECRET } });

    const { crm } = redactMcpServerTools(input);

    expect(Object.keys(crm.config).sort()).toEqual(['headers', 'type', 'url']);
    expect(JSON.stringify(crm)).not.toContain(HEADER_SECRET);
    expect(JSON.stringify(crm)).not.toContain(ENV_SECRET);
  });

  it('masks the user name, password and query values of a URL and keeps scheme, host and path', () => {
    const input = serverTools();

    Object.assign(input.crm.config, {
      url: 'https://ci-bot:p%40ss-url-secret@mcp.crm.example:8443/v1/mcp?api_key=qs-secret-41&region=eu#access_token=frag-secret',
    });

    const redacted = redactMcpServerTools(input);

    expect(redacted.crm.config.url).toBe(
      `https://${REDACTED_VALUE}@mcp.crm.example:8443/v1/mcp?api_key=${REDACTED_VALUE}&region=${REDACTED_VALUE}#access_token=${REDACTED_VALUE}`,
    );

    for (const secret of ['ci-bot', 'p%40ss-url-secret', 'qs-secret-41', 'frag-secret']) {
      expect(JSON.stringify(redacted)).not.toContain(secret);
    }
  });

  it('keeps a URL without credentials as it is, and masks the query of one that does not parse', () => {
    const input = serverTools();

    Object.assign(input.crm.config, { url: 'https://mcp.crm.example/workspace/acme/mcp?read_only' });
    Object.assign(input.warehouse.config, { url: 'events.example/sse?key=bare-secret' });

    const redacted = redactMcpServerTools(input);

    expect(redacted.crm.config.url).toBe('https://mcp.crm.example/workspace/acme/mcp?read_only');
    expect(redacted.warehouse.config.url).toBe(`events.example/sse?key=${REDACTED_VALUE}`);
  });

  it('masks credentials in the arguments and keeps the flag names', () => {
    const input = serverTools();

    Object.assign(input.warehouse.config, {
      args: [
        '-y',
        'mcp-remote',
        'https://mcp.events.example/sse?token=arg-url-secret',
        '--header',
        'Authorization: Bearer header-arg-secret',
        '-H',
        'X-Api-Key:raw-header-secret',
        '--api-key',
        'flag-secret-1',
        '--client-secret',
        'flag-secret-2',
        '--password',
        'flag-secret-3',
        '--account=acme-arg-secret',
        'DATABASE_URL=postgres://dsn-user:dsn-secret@db.internal/crm',
        'postgres://pos-user:pos-secret@db.internal/crm',
        'Bearer',
        'pair-secret',
        'Basic b64-inline-secret',
        '--read-only',
        '--token=',
      ],
    });

    const { warehouse } = redactMcpServerTools(input);

    expect(warehouse.config.args).toEqual([
      '-y',
      'mcp-remote',
      `https://mcp.events.example/sse?token=${REDACTED_VALUE}`,
      '--header',
      `Authorization: ${REDACTED_VALUE}`,
      '-H',
      `X-Api-Key:${REDACTED_VALUE}`,
      '--api-key',
      REDACTED_VALUE,
      '--client-secret',
      REDACTED_VALUE,
      '--password',
      REDACTED_VALUE,
      `--account=${REDACTED_VALUE}`,
      `DATABASE_URL=${REDACTED_VALUE}`,
      `postgres://${REDACTED_VALUE}@db.internal/crm`,
      'Bearer',
      REDACTED_VALUE,
      `Basic ${REDACTED_VALUE}`,
      '--read-only',
      '--token=',
    ]);

    const payload = JSON.stringify(warehouse);

    for (const secret of [
      'arg-url-secret',
      'header-arg-secret',
      'raw-header-secret',
      'flag-secret',
      'acme-arg-secret',
      'dsn-secret',
      'pos-secret',
      'pair-secret',
      'b64-inline-secret',
    ]) {
      expect(payload).not.toContain(secret);
    }
  });

  it('masks URL and argument credentials quoted in the error of an unavailable server', () => {
    const input = serverTools();

    Object.assign(input.crm, {
      status: 'unavailable',
      error:
        'Request to https://ci-bot:p@ss-url-secret@mcp.crm.example/v1/mcp?api_key=qs-secret-41 failed; ' +
        'redirected to https://login.crm.example/authorize?code=redirect-secret',
    });
    Object.assign(input.crm.config, {
      url: 'https://ci-bot:p%40ss-url-secret@mcp.crm.example/v1/mcp?api_key=qs-secret-41',
    });
    Object.assign(input.warehouse, { error: 'spawn warehouse-mcp --api-key flag-secret-1 --dsn=dsn-secret failed' });
    Object.assign(input.warehouse.config, { args: ['--api-key', 'flag-secret-1', '--dsn=dsn-secret'] });

    const redacted = redactMcpServerTools(input);
    const payload = JSON.stringify(redacted);

    for (const secret of [
      'ci-bot',
      'p@ss-url-secret',
      'qs-secret-41',
      'redirect-secret',
      'flag-secret-1',
      'dsn-secret',
    ]) {
      expect(payload).not.toContain(secret);
    }

    expect(redacted.crm).toMatchObject({
      error: expect.stringContaining('@mcp.crm.example/v1/mcp?api_key='),
    });
    expect(redacted.warehouse).toMatchObject({
      error: `spawn warehouse-mcp --api-key ${REDACTED_VALUE} --dsn=${REDACTED_VALUE} failed`,
    });
  });

  /*
   * The route stores whatever JSON was posted, including entries that failed
   * validation, so the config is not guaranteed to match its type.
   */
  it.each([
    ['a missing config', undefined],
    ['a null config', null],
    ['a string config', HEADER_SECRET],
    ['an array config', [HEADER_SECRET]],
    ['headers that are a string', { type: 'sse', url: 'https://events.example/sse', headers: HEADER_SECRET }],
    ['headers that are an array', { type: 'sse', url: 'https://events.example/sse', headers: [HEADER_SECRET] }],
    ['a nested header value', { type: 'sse', url: 'https://events.example/sse', headers: { a: { b: HEADER_SECRET } } }],
    ['a non-string env value', { command: 'run', env: { TOKEN: [HEADER_SECRET] } }],
    ['a non-string url', { type: 'sse', url: { href: HEADER_SECRET } }],
    ['args that are not all strings', { command: 'run', args: ['--token', { value: HEADER_SECRET }] }],
  ])('never throws or leaks for %s', (_label, config) => {
    const input = {
      broken: { status: 'unavailable', error: 'invalid configuration', client: null, config },
    } as unknown as MCPServerTools;

    const redacted = redactMcpServerTools(input);

    expect(redacted.broken.status).toBe('unavailable');
    expect(JSON.stringify(redacted)).not.toContain(HEADER_SECRET);
  });
});

describe('redactErrorText', () => {
  const config = {
    type: 'streamable-http',
    url: 'https://mcp.crm.example/mcp?api_key=qs-secret-41',
    headers: { Authorization: HEADER_SECRET },
  };

  it('masks the message of an error and of its cause', () => {
    const error = new TypeError(`Headers.append: "${HEADER_SECRET}" is an invalid header value.`, {
      cause: new Error('connect ECONNREFUSED for https://mcp.crm.example/mcp?api_key=qs-secret-41'),
    });

    expect(redactErrorText(error, config)).toBe(
      `Headers.append: "${REDACTED_VALUE}" is an invalid header value. ` +
        `(cause: connect ECONNREFUSED for https://mcp.crm.example/mcp?api_key=${REDACTED_VALUE})`,
    );
  });

  it('masks a string the same way and gives nothing for other values', () => {
    expect(redactErrorText(`bad key qs-secret-41`, config)).toBe(`bad key ${REDACTED_VALUE}`);
    expect(redactErrorText({ message: HEADER_SECRET }, config)).toBe('');
    expect(redactErrorText(undefined, undefined)).toBe('');
  });

  it('masks URL credentials in the text even when the config has none', () => {
    expect(redactErrorText('fetch https://user:pw-9f@other.example/a?b=c-secret failed', null)).toBe(
      `fetch https://${REDACTED_VALUE}@other.example/a?b=${REDACTED_VALUE} failed`,
    );
    expect(redactErrorText('Could not reach https://other.example/a?b=c-secret.', null)).toBe(
      `Could not reach https://other.example/a?b=${REDACTED_VALUE}.`,
    );
  });
});
