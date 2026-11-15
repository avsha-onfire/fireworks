import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import {
  GTM_CONNECTORS,
  GTM_CONNECTOR_CATEGORIES,
  GTM_CONNECTOR_ID_PREFIX,
  GTM_SIGN_IN_CONNECTORS,
  getGtmConnectorCategoryLabel,
  getOAuthWorkaround,
  getSignInConnector,
  getSignInVariant,
  isOAuthConnector,
  isSignInConnector,
  isTokenConnector,
  type GtmTokenConnector,
} from './connectors';
import { mcpServerConfigSchema } from '~/lib/services/mcpService';

const tokenConnectors = GTM_CONNECTORS.filter(isTokenConnector);
const oauthConnectors = GTM_CONNECTORS.filter(isOAuthConnector);

/** The documented sign-in for each vendor, written out independently of the catalog. */
const SIGN_IN_RECIPES = {
  'gtm-hubspot': {
    access: 'read-write',
    scopes: undefined,
    clientSecretRequired: true,
    env: ['HUBSPOT_MCP_CLIENT_ID', 'HUBSPOT_MCP_CLIENT_SECRET'],
    variants: [['default', 'https://mcp.hubspot.com', 'https://mcp.hubspot.com']],
  },
  'gtm-salesforce': {
    access: 'read-only',
    scopes: ['mcp_api', 'refresh_token'],
    clientSecretRequired: false,
    env: ['SALESFORCE_MCP_CLIENT_ID', 'SALESFORCE_MCP_CLIENT_SECRET'],
    variants: [
      [
        'production',
        'https://api.salesforce.com/platform/mcp/v1/platform/sobject-reads',
        'https://login.salesforce.com',
      ],
      [
        'sandbox',
        'https://api.salesforce.com/platform/mcp/v1/sandbox/platform/sobject-reads',
        'https://test.salesforce.com',
      ],
    ],
  },
};

describe('GTM sign-in connectors', () => {
  it('connects HubSpot and Salesforce, as their documentation describes', () => {
    expect(GTM_SIGN_IN_CONNECTORS.map((connector) => connector.id).sort()).toEqual(Object.keys(SIGN_IN_RECIPES).sort());

    for (const connector of GTM_SIGN_IN_CONNECTORS) {
      const recipe = SIGN_IN_RECIPES[connector.id as keyof typeof SIGN_IN_RECIPES];

      expect(connector.signIn.access).toBe(recipe.access);
      expect(connector.signIn.scopes).toEqual(recipe.scopes);
      expect(connector.signIn.clientSecretRequired).toBe(recipe.clientSecretRequired);
      expect([connector.signIn.clientIdEnv, connector.signIn.clientSecretEnv]).toEqual(recipe.env);
      expect(
        connector.signIn.variants.map((variant) => [variant.value, variant.serverUrl, variant.authorizationServer]),
      ).toEqual(recipe.variants);
      expect(connector.signIn.note.trim()).not.toBe('');
      expect(connector.signIn.setup).toContain(connector.signIn.clientIdEnv);
    }
  });

  it('reads Salesforce only through the read-only SObject Reads server', () => {
    const salesforce = getSignInConnector('gtm-salesforce')!;

    for (const variant of salesforce.signIn.variants) {
      expect(variant.serverUrl.endsWith('/platform/sobject-reads')).toBe(true);
    }

    expect(salesforce.docsUrl).toContain('sobject-reads');
  });

  it('keeps app credentials out of variables that Vite sends to the browser', () => {
    for (const connector of GTM_SIGN_IN_CONNECTORS) {
      for (const name of [connector.signIn.clientIdEnv, connector.signIn.clientSecretEnv]) {
        expect(name).toMatch(/^[A-Z][A-Z0-9_]*$/);
        expect(name.startsWith('VITE_')).toBe(false);
      }
    }
  });

  it('finds connectors and environments by id, and nothing else', () => {
    const salesforce = getSignInConnector('gtm-salesforce')!;

    expect(isSignInConnector(salesforce)).toBe(true);
    expect(getSignInConnector('gtm-pipedrive')).toBeUndefined();
    expect(getSignInConnector('gtm-linear')).toBeUndefined();
    expect(getSignInConnector({ id: 'gtm-hubspot' })).toBeUndefined();
    expect(getSignInVariant(salesforce)?.value).toBe('production');
    expect(getSignInVariant(salesforce, 'sandbox')?.value).toBe('sandbox');
    expect(getSignInVariant(salesforce, 'eu')).toBeUndefined();
    expect(getSignInVariant(salesforce, null)).toBeUndefined();
  });
});

const base64 = (text: string) => Buffer.from(text, 'utf8').toString('base64');

interface Recipe {
  values: Record<string, string>;
  url: string;
  headers: Record<string, string>;
}

/** The documented connection for each one-click entry, written out independently of the catalog. */
const RECIPES: Record<string, Recipe> = {
  'gtm-zapier': {
    values: { token: 'zapier-token' },
    url: 'https://mcp.zapier.com/api/v1/connect',
    headers: { Authorization: 'Bearer zapier-token' },
  },
  'gtm-snowflake': {
    values: {
      accountHost: 'acme-prod1.snowflakecomputing.com',
      database: 'REVENUE',
      schema: 'GTM_MART',
      serverName: 'pipeline$mcp',
      token: 'snowflake-pat',
    },
    url: 'https://acme-prod1.snowflakecomputing.com/api/v2/databases/REVENUE/schemas/GTM_MART/mcp-servers/pipeline%24mcp',
    headers: { Authorization: 'Bearer snowflake-pat' },
  },
  'gtm-apollo': {
    values: { apiKey: 'apollo-master-key' },
    url: 'https://mcp.apollo.io/mcp',
    headers: { 'X-Api-Key': 'apollo-master-key' },
  },
  'gtm-airtable': {
    values: { token: 'airtable-pat' },
    url: 'https://mcp.airtable.com/mcp',
    headers: { Authorization: 'Bearer airtable-pat' },
  },
  'gtm-close': {
    values: { apiKey: 'close-key' },
    url: 'https://mcp.close.com/mcp',
    headers: { 'Close-API-Key': 'close-key', 'Close-Scope': 'mcp.read' },
  },
  'gtm-intercom': {
    values: { region: 'eu', token: 'intercom-token' },
    url: 'https://mcp.eu.intercom.com/mcp',
    headers: { Authorization: 'Bearer intercom-token' },
  },
  'gtm-notion': {
    values: { token: 'notion-mcp-token' },
    url: 'https://mcp.notion.com/mcp',
    headers: { Authorization: 'Bearer notion-mcp-token' },
  },
  'gtm-posthog': {
    values: { apiKey: 'phx_key' },
    url: 'https://mcp.posthog.com/mcp',
    headers: { Authorization: 'Bearer phx_key', 'x-posthog-read-only': 'true' },
  },
  'gtm-mixpanel': {
    values: { region: 'in', username: 'builder.abc123.mp-service-account', secret: 'pä55:wörd' },
    url: 'https://mcp-in.mixpanel.com/mcp',
    headers: { Authorization: `Bearer Basic ${base64('builder.abc123.mp-service-account:pä55:wörd')}` },
  },
  'gtm-linear': {
    values: { apiKey: 'lin_api_key' },
    url: 'https://mcp.linear.app/mcp/readonly',
    headers: { Authorization: 'Bearer lin_api_key' },
  },
  'gtm-atlassian': {
    values: { email: 'zoë@example.com', apiToken: 'atlassian-token' },
    url: 'https://mcp.atlassian.com/v2/mcp',
    headers: { Authorization: `Basic ${base64('zoë@example.com:atlassian-token')}` },
  },
  'gtm-supabase': {
    values: { projectRef: 'abcdefghijklmnopqrst', token: 'sbp_token' },
    url: 'https://mcp.supabase.com/mcp?project_ref=abcdefghijklmnopqrst&read_only=true',
    headers: { Authorization: 'Bearer sbp_token' },
  },
};

function getTokenConnector(id: string): GtmTokenConnector {
  const connector = tokenConnectors.find((candidate) => candidate.id === id);

  if (!connector) {
    throw new Error(`No token connector with id ${id}`);
  }

  return connector;
}

function build(id: string, overrides: Record<string, string> = {}) {
  return getTokenConnector(id).buildConfig({ ...RECIPES[id].values, ...overrides });
}

describe('GTM connector catalog', () => {
  it('uses unique, prefixed, kebab-case ids that cannot collide with built-in servers', () => {
    const ids = GTM_CONNECTORS.map((connector) => connector.id);

    expect(new Set(ids).size).toBe(ids.length);

    for (const id of ids) {
      expect(id.startsWith(GTM_CONNECTOR_ID_PREFIX)).toBe(true);
      expect(id).toMatch(/^gtm-[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(id).not.toBe('browser-use-cloud');
    }
  });

  it('describes every entry and links to vendor documentation over https', () => {
    for (const connector of GTM_CONNECTORS) {
      expect(connector.name.trim()).not.toBe('');
      expect(connector.vendor.trim()).not.toBe('');
      expect(connector.description.trim()).not.toBe('');
      expect(new URL(connector.docsUrl).protocol).toBe('https:');
      expect(connector.verifiedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(getGtmConnectorCategoryLabel(connector.category)).not.toBe(connector.category);
    }
  });

  it('has no category without a connector', () => {
    const used = new Set(GTM_CONNECTORS.map((connector) => connector.category));

    expect(GTM_CONNECTOR_CATEGORIES.filter((category) => !used.has(category.id))).toEqual([]);
  });

  it('lists vendors that need an interactive sign-in without a way to add them', () => {
    expect(oauthConnectors.map((connector) => connector.vendor)).toEqual(
      expect.arrayContaining(['Salesforce', 'HubSpot', 'Pipedrive', 'Outreach', 'Salesloft', 'Gong', 'Slack']),
    );

    for (const connector of oauthConnectors) {
      expect(connector).not.toHaveProperty('buildConfig');
      expect(connector).not.toHaveProperty('fields');
      expect(connector).not.toHaveProperty('access');
    }
  });

  it('suggests a CSV export until sign-in works, except where the vendor has none', () => {
    const byVendor = new Map(oauthConnectors.map((connector) => [connector.vendor, connector]));

    expect(getOAuthWorkaround(byVendor.get('Salesforce')!)).toBe(
      'Until then: export a CSV from Salesforce and attach it to your message.',
    );
    expect(getOAuthWorkaround(byVendor.get('Slack')!)).not.toContain('CSV');
  });

  it('leaves out vendors whose servers move money or have an account-specific address', () => {
    const vendors = GTM_CONNECTORS.map((connector) => connector.vendor.toLowerCase());

    expect(vendors.filter((vendor) => vendor.includes('stripe') || vendor.includes('zoho'))).toEqual([]);
  });

  it('gives every one-click entry a secret field, an access level and a note about the key', () => {
    for (const connector of tokenConnectors) {
      const keys = connector.fields.map((field) => field.key);

      expect(new Set(keys).size).toBe(keys.length);
      expect(connector.fields.some((field) => field.secret)).toBe(true);
      expect(['read-only', 'read-write']).toContain(connector.access);
      expect(connector.note.trim()).not.toBe('');

      for (const field of connector.fields) {
        expect(field.label.trim()).not.toBe('');
      }
    }
  });

  it('says in the note what a full-access key can change and how to keep it to reading', () => {
    const apollo = getTokenConnector('gtm-apollo').note;

    for (const action of [
      'send e-mails',
      'enrol contacts in sequences',
      'create and update records',
      'buy sending domains and mailboxes',
    ]) {
      expect(apollo).toContain(action);
    }

    expect(apollo).toContain('reject those tool calls or turn those tools off');
    expect(getTokenConnector('gtm-atlassian').note).toContain(
      'Create the token with read scopes only to keep it to reading; with write scopes it can also create and update issues.',
    );
    expect(getTokenConnector('gtm-posthog').note).toContain("PostHog's read-only mode (x-posthog-read-only)");
  });

  it('has a documented recipe under test for every one-click entry', () => {
    expect(Object.keys(RECIPES).sort()).toEqual(tokenConnectors.map((connector) => connector.id).sort());
  });
});

describe('buildConfig', () => {
  it.each(Object.entries(RECIPES))('%s builds the documented endpoint and headers', (id, recipe) => {
    expect(build(id)).toEqual({ type: 'streamable-http', url: recipe.url, headers: recipe.headers });
  });

  it.each(Object.keys(RECIPES))('%s builds a config the MCP service accepts unchanged', (id) => {
    const config = build(id);
    const parsed = mcpServerConfigSchema.safeParse(config);

    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual(config);
    expect(config).toHaveProperty('type', 'streamable-http');

    if (!('url' in config)) {
      throw new Error(`${id} did not build a remote server`);
    }

    const url = new URL(config.url);

    expect(url.protocol).toBe('https:');
    expect(url.username).toBe('');
    expect(url.password).toBe('');
    expect(url.port).toBe('');
    expect(Object.keys(config.headers ?? {})).not.toHaveLength(0);
  });

  it('keeps the read-only mechanism of every entry labelled read-only', () => {
    const readOnlyIds = tokenConnectors
      .filter((connector) => connector.access === 'read-only')
      .map((connector) => connector.id);

    expect(readOnlyIds.sort()).toEqual(['gtm-close', 'gtm-linear', 'gtm-posthog', 'gtm-supabase']);
    expect(build('gtm-close')).toHaveProperty('headers.Close-Scope', 'mcp.read');
    expect(build('gtm-posthog')).toHaveProperty(['headers', 'x-posthog-read-only'], 'true');
    expect(build('gtm-linear')).toHaveProperty('url', 'https://mcp.linear.app/mcp/readonly');
    expect(build('gtm-supabase')).toHaveProperty('url', expect.stringContaining('read_only=true'));
  });

  it('selects the endpoint of the chosen data region', () => {
    expect(build('gtm-intercom', { region: 'us' })).toHaveProperty('url', 'https://mcp.intercom.com/mcp');
    expect(build('gtm-mixpanel', { region: 'us' })).toHaveProperty('url', 'https://mcp.mixpanel.com/mcp');
    expect(build('gtm-mixpanel', { region: 'eu' })).toHaveProperty('url', 'https://mcp-eu.mixpanel.com/mcp');
    expect(() => build('gtm-intercom', { region: 'au' })).toThrow('Choose a data region.');
    expect(() => build('gtm-mixpanel', { region: 'evil.io' })).toThrow('Choose a data region.');
  });

  it('offers exactly the regions it can build', () => {
    for (const id of ['gtm-intercom', 'gtm-mixpanel']) {
      const options = getTokenConnector(id).fields.find((field) => field.key === 'region')?.options ?? [];

      expect(options.length).toBeGreaterThan(1);

      for (const option of options) {
        expect(() => build(id, { region: option.value })).not.toThrow();
      }
    }
  });

  it('trims pasted values', () => {
    expect(build('gtm-zapier', { token: '  zapier-token\n' })).toHaveProperty(
      'headers.Authorization',
      'Bearer zapier-token',
    );
    expect(build('gtm-snowflake', { accountHost: ' Acme-Prod1.SnowflakeComputing.com ' })).toHaveProperty(
      'url',
      RECIPES['gtm-snowflake'].url,
    );
  });

  it('rejects line breaks and other control characters in every field of every entry', () => {
    for (const connector of tokenConnectors) {
      for (const field of connector.fields) {
        for (const hostile of ['abc\r\nX-Injected: 1', 'abc\nX-Injected: 1', 'abc\rdef', 'abc\u0000def']) {
          expect(
            () => build(connector.id, { [field.key]: hostile }),
            `${connector.id} ${field.key} ${JSON.stringify(hostile)}`,
          ).toThrow(Error);
        }
      }
    }

    expect(() => build('gtm-apollo', { apiKey: 'abc\r\nX-Injected: 1' })).toThrow(
      'Master API key must be a single line without line breaks or other control characters.',
    );
  });

  it('requires every field and names the missing one', () => {
    for (const connector of tokenConnectors) {
      for (const field of connector.fields) {
        expect(() => build(connector.id, { [field.key]: '   ' }), `${connector.id} ${field.key}`).toThrow(
          `${field.label} is required.`,
        );
      }

      expect(() => connector.buildConfig({}), connector.id).toThrow(/ is required\.$/);
    }
  });

  it('rejects a colon in the user half of a basic credential', () => {
    expect(() => build('gtm-atlassian', { email: 'me@example.com:extra' })).toThrow('must not contain a colon');
    expect(() => build('gtm-mixpanel', { username: 'user:name' })).toThrow('must not contain a colon');
  });

  it.each([
    'x.snowflakecomputing.com.evil.io',
    'evil.io/.snowflakecomputing.com',
    'a@b.snowflakecomputing.com',
    'user:pass@acme.snowflakecomputing.com',
    'https://acme.snowflakecomputing.com',
    'acme.snowflakecomputing.com/',
    'acme.snowflakecomputing.com:8443',
    'acme.snowflakecomputing.com?x=1',
    'acme.snowflakecomputing.com#x',
    'acme.snowflakecomputing.com\\evil.io',
    'acme_prod.snowflakecomputing.com',
    'acme..snowflakecomputing.com',
    '-acme.snowflakecomputing.com',
    'acme snowflakecomputing.com',
    'snowflakecomputing.com',
    '.snowflakecomputing.com',
    'evilsnowflakecomputing.com',
    'acme.snowflakecomputing.co',
    'evil.io',
    '127.0.0.1',
    '0x7f.1',
    'xn--a.snowflakecomputing.com',
    'localhost',
    `${'a'.repeat(240)}.snowflakecomputing.com`,
  ])('rejects the account host %s', (accountHost) => {
    expect(() => build('gtm-snowflake', { accountHost })).toThrow(/^Account host must /);
  });

  it.each(['../admin', '..', 'a/b', 'a\\b', 'a.b', 'a b', 'a%2Fb', 'a?b', 'a#b', 'a&b=c', 'é', 'x'.repeat(256)])(
    'rejects the path part %s',
    (part) => {
      for (const key of ['database', 'schema', 'serverName']) {
        expect(() => build('gtm-snowflake', { [key]: part }), key).toThrow('may only contain letters, digits');
      }

      expect(() => build('gtm-supabase', { projectRef: part })).toThrow('may only contain letters, digits');
    },
  );

  it('accepts path parts of the maximum length', () => {
    const longest = 'x'.repeat(255);

    expect(build('gtm-snowflake', { database: longest })).toHaveProperty('url', expect.stringContaining(longest));
  });
});
