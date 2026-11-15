import type { MCPServerConfig } from '~/lib/services/mcpService';

/*
 * Catalog of vendor-hosted MCP servers for go-to-market tools.
 *
 * Token entries send a static header the vendor documents. Sign-in entries
 * (`signIn`) connect through the vendor's OAuth flow, run by this server in
 * app/lib/.server/mcp-oauth. Every endpoint, header and scope below was taken
 * from the vendor's documentation on the `verifiedOn` date; vendors that only
 * document an interactive sign-in and have no `signIn` block are listed for
 * reference without a way to add them.
 */

export type GtmConnectorCategoryId =
  | 'crm'
  | 'prospecting'
  | 'sales-engagement'
  | 'customer-success'
  | 'analytics'
  | 'data-warehouse'
  | 'workspace'
  | 'automation';

export interface GtmConnectorCategory {
  id: GtmConnectorCategoryId;
  label: string;
}

export interface GtmConnectorFieldOption {
  value: string;
  label: string;
}

export interface GtmConnectorField {
  /** Key in the values object passed to `buildConfig`. */
  key: string;
  label: string;
  placeholder?: string;

  /** Render as a password input. */
  secret?: boolean;
  helpText?: string;

  /** Render as a select with these choices; the first one is the default. */
  options?: GtmConnectorFieldOption[];
}

/**
 * `read-only`: the connection itself is limited to reading through a mechanism
 * the vendor documents (endpoint, scope header or query parameter).
 * `read-write`: nothing in the connection limits it; what it can change is
 * decided by the key.
 */
export type GtmConnectorAccess = 'read-only' | 'read-write';

interface GtmConnectorBase {
  /** Kebab-case id; also the key under `mcpServers`. */
  id: string;
  name: string;
  vendor: string;
  category: GtmConnectorCategoryId;

  /** What a GTM builder can reach through it. */
  description: string;

  /** Official vendor documentation for the MCP server. */
  docsUrl: string;

  /** ISO date the endpoint was last checked against the vendor's documentation. */
  verifiedOn: string;
}

/** A static header works, so one-click add is offered. */
export interface GtmTokenConnector extends GtmConnectorBase {
  auth: 'token';
  access: GtmConnectorAccess;
  fields: GtmConnectorField[];

  /** Builds the MCP server entry from the field values. Throws a user-facing Error on invalid input. */
  buildConfig: (values: Record<string, string>) => MCPServerConfig;

  /** What the key can do and what must be set up first; shown before the user enters a key. */
  note: string;
}

/** One environment a sign-in entry can reach, such as a Salesforce sandbox. */
export interface GtmSignInVariant extends GtmConnectorFieldOption {
  /** MCP server URL from the vendor's documentation. */
  serverUrl: string;

  /** The authorization server the vendor documents for it. Discovery must name exactly this one. */
  authorizationServer: string;
}

/** How a sign-in entry connects. Only entries with this block can be connected. */
export interface GtmOAuthSignIn {
  access: GtmConnectorAccess;

  /** Environments to choose from; the first is the default. */
  variants: GtmSignInVariant[];

  /** Scopes from the vendor's documentation. Left out when the vendor sets them itself. */
  scopes?: string[];

  /** Server environment variables that hold this deployment's app credentials. */
  clientIdEnv: string;
  clientSecretEnv: string;

  /** False when the vendor accepts a client without a secret (PKCE alone). */
  clientSecretRequired: boolean;

  /** What the connection can do; shown before sign-in. */
  note: string;

  /** How an administrator registers the app; shown while it is not set up. */
  setup: string;
}

/** The vendor only documents an interactive sign-in. */
export interface GtmOAuthConnector extends GtmConnectorBase {
  auth: 'oauth';

  /** How to get the same data into a build today, when a CSV export is not the answer. */
  workaround?: string;

  /** Present when this build can run the vendor's sign-in. */
  signIn?: GtmOAuthSignIn;
}

export type GtmSignInConnector = GtmOAuthConnector & { signIn: GtmOAuthSignIn };

export type GtmConnector = GtmTokenConnector | GtmOAuthConnector;

/** Keeps catalog entries apart from servers the user named themselves. */
export const GTM_CONNECTOR_ID_PREFIX = 'gtm-';

export const GTM_CONNECTOR_CATEGORIES: GtmConnectorCategory[] = [
  { id: 'crm', label: 'CRM' },
  { id: 'prospecting', label: 'Prospecting data' },
  { id: 'sales-engagement', label: 'Sales engagement' },
  { id: 'customer-success', label: 'Customer success' },
  { id: 'analytics', label: 'Product analytics' },
  { id: 'data-warehouse', label: 'Data warehouse' },
  { id: 'workspace', label: 'Workspace' },
  { id: 'automation', label: 'Automation' },
];

const VERIFIED_ON = '2026-11-12';

/*
 * The checks below are input hygiene: they keep a pasted value from changing
 * the shape of a header or URL. They are not SSRF protection; the server
 * connects to whatever URL a saved configuration names.
 */

const CONTROL_CHARACTER = /\p{Cc}/u;
const HOST_NAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const MAX_HOST_NAME_LENGTH = 253;
const URL_PART = /^[A-Za-z0-9_$-]{1,255}$/;

interface FieldReader<K extends string> {
  /** Trimmed, non-empty value without line breaks or other control characters. */
  text: (key: K) => string;

  /** Like `text`, for the user half of a `user:secret` pair. */
  userName: (key: K) => string;

  /** Lower-cased tenant host name ending with `suffix`, which starts with a dot. */
  host: (key: K, suffix: string) => string;

  /** Percent-encoded value for one URL path segment or query value. */
  urlPart: (key: K) => string;
}

function isPlainHost(host: string): boolean {
  try {
    const url = new URL(`https://${host}`);

    return url.hostname === host && url.port === '' && url.username === '' && url.password === '';
  } catch {
    return false;
  }
}

function createFieldReader<K extends string>(
  fields: Array<GtmConnectorField & { key: K }>,
  values: Record<string, string>,
): FieldReader<K> {
  const labelOf = (key: K) => fields.find((field) => field.key === key)?.label ?? key;

  const text = (key: K) => {
    const raw = values[key];
    const value = typeof raw === 'string' ? raw.trim() : '';

    if (!value) {
      throw new Error(`${labelOf(key)} is required.`);
    }

    if (CONTROL_CHARACTER.test(value)) {
      throw new Error(`${labelOf(key)} must be a single line without line breaks or other control characters.`);
    }

    return value;
  };

  const userName = (key: K) => {
    const value = text(key);

    if (value.includes(':')) {
      throw new Error(`${labelOf(key)} must not contain a colon.`);
    }

    return value;
  };

  const host = (key: K, suffix: string) => {
    const value = text(key).toLowerCase();

    if (value.length > MAX_HOST_NAME_LENGTH || !HOST_NAME.test(value) || !isPlainHost(value)) {
      throw new Error(
        `${labelOf(key)} must be a host name only, such as your-account${suffix}, without "https://", a path or underscores.`,
      );
    }

    if (!value.endsWith(suffix)) {
      throw new Error(`${labelOf(key)} must end with "${suffix}".`);
    }

    return value;
  };

  const urlPart = (key: K) => {
    const value = text(key);

    if (!URL_PART.test(value)) {
      throw new Error(`${labelOf(key)} may only contain letters, digits, "_", "$" and "-" (255 characters at most).`);
    }

    return encodeURIComponent(value);
  };

  return { text, userName, host, urlPart };
}

function toBase64(text: string): string {
  let binary = '';

  for (const byte of new TextEncoder().encode(text)) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function remoteServer(url: string, headers: Record<string, string>): MCPServerConfig {
  return { type: 'streamable-http', url, headers };
}

interface RegionEndpoint extends GtmConnectorFieldOption {
  url: string;
}

function regionField(regions: RegionEndpoint[], helpText?: string): GtmConnectorField & { key: 'region' } {
  return {
    key: 'region',
    label: 'Data region',
    options: regions.map(({ value, label }) => ({ value, label })),
    helpText,
  };
}

function regionUrl(regions: RegionEndpoint[], value: string): string {
  const region = regions.find((candidate) => candidate.value === value);

  if (!region) {
    throw new Error('Choose a data region.');
  }

  return region.url;
}

interface TokenConnectorDefinition<K extends string> extends Omit<
  GtmTokenConnector,
  'auth' | 'verifiedOn' | 'fields' | 'buildConfig'
> {
  fields: Array<GtmConnectorField & { key: K }>;
  build: (input: FieldReader<K>) => MCPServerConfig;
}

function tokenConnector<K extends string>({ build, ...definition }: TokenConnectorDefinition<K>): GtmTokenConnector {
  return {
    ...definition,
    auth: 'token',
    verifiedOn: VERIFIED_ON,
    buildConfig: (values) => build(createFieldReader(definition.fields, values)),
  };
}

function oauthConnector(
  definition: Omit<GtmOAuthConnector, 'auth' | 'verifiedOn'> & { verifiedOn?: string },
): GtmOAuthConnector {
  return { verifiedOn: VERIFIED_ON, ...definition, auth: 'oauth' };
}

/** Sign-in entries were checked against the docs and the servers' published metadata on this date. */
const SIGN_IN_VERIFIED_ON = '2026-11-13';

const INTERCOM_REGIONS: RegionEndpoint[] = [
  { value: 'us', label: 'US', url: 'https://mcp.intercom.com/mcp' },
  { value: 'eu', label: 'EU', url: 'https://mcp.eu.intercom.com/mcp' },
];

const MIXPANEL_REGIONS: RegionEndpoint[] = [
  { value: 'us', label: 'US', url: 'https://mcp.mixpanel.com/mcp' },
  { value: 'eu', label: 'EU', url: 'https://mcp-eu.mixpanel.com/mcp' },
  { value: 'in', label: 'IN', url: 'https://mcp-in.mixpanel.com/mcp' },
];

/** Ordered by how much a GTM team typically gets out of each connection. */
const TOKEN_CONNECTORS: GtmTokenConnector[] = [
  tokenConnector({
    id: 'gtm-zapier',
    name: 'Zapier MCP',
    vendor: 'Zapier',
    category: 'automation',
    description:
      'Reach the apps you already connected to Zapier, such as your CRM, e-mail and sheets, through the actions you add to one Zapier MCP server.',
    docsUrl: 'https://docs.zapier.com/mcp/overview/how-connections-work',
    access: 'read-write',
    fields: [
      {
        key: 'token',
        label: 'Connection token',
        secret: true,
        helpText: 'Create a server at mcp.zapier.com, then generate its token. It is shown only once.',
      },
    ],
    note: 'The token belongs to one Zapier MCP server and can run every action added to that server, including actions that create, change or send things. For a read-only connection, add only actions that read data.',
    build: (input) =>
      remoteServer('https://mcp.zapier.com/api/v1/connect', { Authorization: `Bearer ${input.text('token')}` }),
  }),
  tokenConnector({
    id: 'gtm-snowflake',
    name: 'Snowflake managed MCP server',
    vendor: 'Snowflake',
    category: 'data-warehouse',
    description:
      'Query governed warehouse data through the Cortex Analyst, Cortex Search, agent and SQL tools exposed by an MCP server object in your account.',
    docsUrl: 'https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents-mcp',
    access: 'read-write',
    fields: [
      {
        key: 'accountHost',
        label: 'Account host',
        placeholder: 'your-account.snowflakecomputing.com',
        helpText: 'Host name only. Use hyphens, not underscores.',
      },
      { key: 'database', label: 'Database' },
      { key: 'schema', label: 'Schema' },
      { key: 'serverName', label: 'MCP server name' },
      { key: 'token', label: 'Programmatic access token', secret: true },
    ],
    note: 'The MCP server object must already exist in your account (CREATE MCP SERVER). The token can do whatever its role allows through the tools on that server, so restrict it to a least-privileged, read-only role. Snowflake accepts a token for a person user only when that user is covered by a network policy.',
    build: (input) => {
      const host = input.host('accountHost', '.snowflakecomputing.com');
      const path = `databases/${input.urlPart('database')}/schemas/${input.urlPart('schema')}/mcp-servers/${input.urlPart('serverName')}`;

      return remoteServer(`https://${host}/api/v2/${path}`, { Authorization: `Bearer ${input.text('token')}` });
    },
  }),
  tokenConnector({
    id: 'gtm-apollo',
    name: 'Apollo MCP',
    vendor: 'Apollo.io',
    category: 'prospecting',
    description: 'Search people and companies, enrich contacts and read sequences, tasks and analytics from Apollo.',
    docsUrl: 'https://docs.apollo.io/docs/apollo-mcp',
    access: 'read-write',
    fields: [
      {
        key: 'apiKey',
        label: 'Master API key',
        secret: true,
        helpText: 'Must be set as a master key; scoped keys are rejected.',
      },
    ],
    note: 'Apollo accepts only a master API key here, and no read-only key exists for this server. The key has full access to the workspace, acts as its longest-standing active admin, and calls such as enrichment spend workspace credits. It can also send e-mails, enrol contacts in sequences, create and update records, and buy sending domains and mailboxes; reject those tool calls or turn those tools off.',
    build: (input) => remoteServer('https://mcp.apollo.io/mcp', { 'X-Api-Key': input.text('apiKey') }),
  }),
  tokenConnector({
    id: 'gtm-airtable',
    name: 'Airtable MCP server',
    vendor: 'Airtable',
    category: 'workspace',
    description:
      'List bases and read their schema and records, such as lead lists, campaign trackers and lightweight CRMs.',
    docsUrl: 'https://airtable.com/developers/agents/mcp/getting-started',
    access: 'read-write',
    fields: [
      {
        key: 'token',
        label: 'Personal access token',
        secret: true,
        helpText: 'Create one at airtable.com/create/tokens.',
      },
    ],
    note: "The connection can do whatever the token's scopes allow. For a read-only connection, create the token with read scopes only: data.records:read, schema.bases:read, data.recordComments:read and workspacesAndBases:read.",
    build: (input) => remoteServer('https://mcp.airtable.com/mcp', { Authorization: `Bearer ${input.text('token')}` }),
  }),
  tokenConnector({
    id: 'gtm-close',
    name: 'Close MCP server',
    vendor: 'Close',
    category: 'crm',
    description:
      'Search leads, contacts, opportunities and activities, read pipelines and smart views, and run aggregations.',
    docsUrl: 'https://developer.close.com/mcp',
    access: 'read-only',
    fields: [{ key: 'apiKey', label: 'API key', secret: true }],
    note: 'Connects with the read scope (Close-Scope: mcp.read), which limits the connection to the read tools.',
    build: (input) =>
      remoteServer('https://mcp.close.com/mcp', {
        'Close-API-Key': input.text('apiKey'),
        'Close-Scope': 'mcp.read',
      }),
  }),
  tokenConnector({
    id: 'gtm-intercom',
    name: 'Intercom MCP',
    vendor: 'Intercom',
    category: 'customer-success',
    description:
      'Search and read conversations, contacts, companies and help-center articles for support and account-health views.',
    docsUrl: 'https://developers.intercom.com/docs/guides/mcp',
    access: 'read-write',
    fields: [
      regionField(INTERCOM_REGIONS, 'Workspaces hosted in Australia are not supported by Intercom MCP.'),
      {
        key: 'token',
        label: 'Access token',
        secret: true,
        helpText: 'In the Intercom Developer Hub: your app, Configure, Authentication.',
      },
    ],
    note: "Use only the access token of your own Intercom workspace: Intercom's terms do not allow asking other organisations for theirs. Nothing in the connection limits the token to reading, and token connections do not get the Fin Operator tools.",
    build: (input) =>
      remoteServer(regionUrl(INTERCOM_REGIONS, input.text('region')), {
        Authorization: `Bearer ${input.text('token')}`,
      }),
  }),
  tokenConnector({
    id: 'gtm-notion',
    name: 'Notion MCP',
    vendor: 'Notion',
    category: 'workspace',
    description: 'Search workspace pages and query databases such as account plans, playbooks and trackers.',
    docsUrl: 'https://developers.notion.com/guides/mcp/get-started-with-mcp',
    access: 'read-write',
    fields: [
      {
        key: 'token',
        label: 'MCP token',
        secret: true,
        helpText: 'A workspace owner creates it with "New MCP token" in the Notion Developer portal.',
      },
    ],
    note: 'MCP tokens exist only on Notion Business and Enterprise plans; other plans need vendor sign-in, which is not available yet. Nothing in the connection limits the token to reading.',
    build: (input) => remoteServer('https://mcp.notion.com/mcp', { Authorization: `Bearer ${input.text('token')}` }),
  }),
  tokenConnector({
    id: 'gtm-posthog',
    name: 'PostHog MCP',
    vendor: 'PostHog',
    category: 'analytics',
    description: 'Run SQL and analytics queries and read feature flags, experiments, surveys and error data.',
    docsUrl: 'https://posthog.com/docs/model-context-protocol',
    access: 'read-only',
    fields: [
      {
        key: 'apiKey',
        label: 'Personal API key',
        secret: true,
        helpText: 'Create it with the "MCP Server" preset.',
      },
    ],
    note: "Connects in PostHog's read-only mode (x-posthog-read-only), which leaves out the tools that create, update or delete data.",
    build: (input) =>
      remoteServer('https://mcp.posthog.com/mcp', {
        Authorization: `Bearer ${input.text('apiKey')}`,
        'x-posthog-read-only': 'true',
      }),
  }),
  tokenConnector({
    id: 'gtm-mixpanel',
    name: 'Mixpanel MCP server',
    vendor: 'Mixpanel',
    category: 'analytics',
    description: 'Run insights, funnels, flows and retention queries and read events, cohorts and dashboards.',
    docsUrl: 'https://docs.mixpanel.com/docs/mcp',
    access: 'read-write',
    fields: [
      regionField(MIXPANEL_REGIONS),
      { key: 'username', label: 'Service account username' },
      { key: 'secret', label: 'Service account secret', secret: true },
    ],
    note: 'Service-account sign-in for Mixpanel MCP is in beta and may change. MCP must be on for your organisation (Settings, Org, AI Settings) and the service account must be added to every project it should query. The connection can do whatever that service account is allowed to.',
    build: (input) =>
      remoteServer(regionUrl(MIXPANEL_REGIONS, input.text('region')), {
        Authorization: `Bearer Basic ${toBase64(`${input.userName('username')}:${input.text('secret')}`)}`,
      }),
  }),
  tokenConnector({
    id: 'gtm-linear',
    name: 'Linear MCP server',
    vendor: 'Linear',
    category: 'workspace',
    description: 'Read issues, projects and customer requests for feedback and customer-request tracking apps.',
    docsUrl: 'https://linear.app/docs/mcp',
    access: 'read-only',
    fields: [
      {
        key: 'apiKey',
        label: 'API key',
        secret: true,
        helpText: 'A key with only the Read permission is enough.',
      },
    ],
    note: "Connects to Linear's read-only endpoint.",
    build: (input) =>
      remoteServer('https://mcp.linear.app/mcp/readonly', { Authorization: `Bearer ${input.text('apiKey')}` }),
  }),
  tokenConnector({
    id: 'gtm-atlassian',
    name: 'Atlassian MCP server',
    vendor: 'Atlassian',
    category: 'workspace',
    description: 'Search and read Jira work items and Confluence pages.',
    docsUrl: 'https://support.atlassian.com/atlassian-rovo-mcp-server/docs/configuring-authentication-via-api-token/',
    access: 'read-write',
    fields: [
      { key: 'email', label: 'Atlassian account e-mail', placeholder: 'you@example.com' },
      { key: 'apiToken', label: 'API token', secret: true },
    ],
    note: 'Works only if your Atlassian organisation admin has enabled API-token sign-in for the MCP server. Create the token with read scopes only to keep it to reading; with write scopes it can also create and update issues. Some tools are unavailable with API tokens.',
    build: (input) =>
      remoteServer('https://mcp.atlassian.com/v2/mcp', {
        Authorization: `Basic ${toBase64(`${input.userName('email')}:${input.text('apiToken')}`)}`,
      }),
  }),
  tokenConnector({
    id: 'gtm-supabase',
    name: 'Supabase MCP server',
    vendor: 'Supabase',
    category: 'data-warehouse',
    description: 'Inspect the schema and read the data of one Supabase project.',
    docsUrl: 'https://supabase.com/docs/guides/getting-started/mcp',
    access: 'read-only',
    fields: [
      { key: 'projectRef', label: 'Project ref', helpText: 'The connection is limited to this project.' },
      { key: 'token', label: 'Personal access token', secret: true },
    ],
    note: 'Connects in read-only mode (read_only=true) and only to the project you name.',
    build: (input) =>
      remoteServer(`https://mcp.supabase.com/mcp?project_ref=${input.urlPart('projectRef')}&read_only=true`, {
        Authorization: `Bearer ${input.text('token')}`,
      }),
  }),
];

const OAUTH_CONNECTORS: GtmOAuthConnector[] = [
  oauthConnector({
    id: 'gtm-salesforce',
    name: 'Salesforce Hosted MCP Servers',
    vendor: 'Salesforce',
    category: 'crm',
    description:
      'Query and search accounts, contacts, opportunities and custom objects under your Salesforce permissions.',
    docsUrl:
      'https://developer.salesforce.com/docs/platform/hosted-mcp-servers/references/reference/sobject-reads.html',
    verifiedOn: SIGN_IN_VERIFIED_ON,
    signIn: {
      access: 'read-only',
      variants: [
        {
          value: 'production',
          label: 'Production or Developer Edition',
          serverUrl: 'https://api.salesforce.com/platform/mcp/v1/platform/sobject-reads',
          authorizationServer: 'https://login.salesforce.com',
        },
        {
          value: 'sandbox',
          label: 'Sandbox or scratch org',
          serverUrl: 'https://api.salesforce.com/platform/mcp/v1/sandbox/platform/sobject-reads',
          authorizationServer: 'https://test.salesforce.com',
        },
      ],
      scopes: ['mcp_api', 'refresh_token'],
      clientIdEnv: 'SALESFORCE_MCP_CLIENT_ID',
      clientSecretEnv: 'SALESFORCE_MCP_CLIENT_SECRET',
      clientSecretRequired: false,
      note: 'Connects to the SObject Reads server, which can read schema, query, search and follow relationships but cannot create, update or delete records. It works within your Salesforce permissions, field-level security and sharing rules.',
      setup:
        'In Salesforce Setup, open External Client App Manager and create an app. Enable OAuth, add the callback URL below, select the mcp_api and refresh_token scopes, require PKCE and issue JWT-based access tokens. Set SALESFORCE_MCP_CLIENT_ID to its consumer key, and SALESFORCE_MCP_CLIENT_SECRET if the app requires a secret, then restart this server. A new app can take up to 30 minutes to work. Orgs that block logins from login.salesforce.com or test.salesforce.com need a My Domain address, which this connector does not support yet.',
    },
  }),
  oauthConnector({
    id: 'gtm-hubspot',
    name: 'HubSpot MCP Server',
    vendor: 'HubSpot',
    category: 'crm',
    description: 'CRM contacts, companies, deals, tickets and activities under your HubSpot permissions.',
    docsUrl:
      'https://developers.hubspot.com/docs/apps/developer-platform/build-apps/integrate-with-the-remote-hubspot-mcp-server',
    verifiedOn: SIGN_IN_VERIFIED_ON,
    signIn: {
      access: 'read-write',
      variants: [
        {
          value: 'default',
          label: 'HubSpot',
          serverUrl: 'https://mcp.hubspot.com',
          authorizationServer: 'https://mcp.hubspot.com',
        },
      ],
      clientIdEnv: 'HUBSPOT_MCP_CLIENT_ID',
      clientSecretEnv: 'HUBSPOT_MCP_CLIENT_SECRET',
      clientSecretRequired: true,
      note: "HubSpot sets the connection's permissions from its tools and your HubSpot user. There is no read-only option: its tools can also create and update records, properties and pipelines. Every tool call waits for your approval in the chat, and you can turn off tools below once connected.",
      setup:
        'In HubSpot, open Development, MCP Connectors and create an MCP connector. Add the callback URL below as a redirect URL. Set HUBSPOT_MCP_CLIENT_ID and HUBSPOT_MCP_CLIENT_SECRET on this server to its client ID and secret, then restart the server.',
    },
  }),
  oauthConnector({
    id: 'gtm-pipedrive',
    name: 'Pipedrive MCP',
    vendor: 'Pipedrive',
    category: 'crm',
    description: 'Deals, persons, organizations, leads and activities under your Pipedrive permissions.',
    docsUrl: 'https://support.pipedrive.com/en/article/mcp-chatgpt',
  }),
  oauthConnector({
    id: 'gtm-attio',
    name: 'Attio MCP',
    vendor: 'Attio',
    category: 'crm',
    description: 'People, companies, deals, lists, tasks and notes in an Attio workspace.',
    docsUrl: 'https://docs.attio.com/mcp/overview',
  }),
  oauthConnector({
    id: 'gtm-outreach',
    name: 'Outreach MCP Server',
    vendor: 'Outreach',
    category: 'sales-engagement',
    description: 'Prospects, accounts, opportunities and sequence data under your Outreach profile.',
    docsUrl: 'https://support.outreach.io/support/solutions/articles/159000435681-use-outreach-mcp-with-claude',
  }),
  oauthConnector({
    id: 'gtm-salesloft',
    name: 'Salesloft MCP Server',
    vendor: 'Salesloft',
    category: 'sales-engagement',
    description: 'Accounts, people, opportunities, conversations and team data from Salesloft.',
    docsUrl: 'https://help.salesloft.com/s/article/Connect-Salesloft-MCP-Server-in-ChatGPT?language=en_US',
  }),
  oauthConnector({
    id: 'gtm-gong',
    name: 'Gong MCP Server',
    vendor: 'Gong',
    category: 'sales-engagement',
    description: 'Answers and briefs about accounts and deals, drawn from Gong calls and e-mails.',
    docsUrl: 'https://help.gong.io/docs/create-an-integration-to-connect-to-the-mcp-server',
  }),
  oauthConnector({
    id: 'gtm-zoominfo',
    name: 'ZoomInfo MCP',
    vendor: 'ZoomInfo',
    category: 'prospecting',
    description: 'Company and contact search, enrichment and intent signals from ZoomInfo.',
    docsUrl: 'https://github.com/Zoominfo/zoominfo-mcp-plugin',
  }),
  oauthConnector({
    id: 'gtm-clay',
    name: 'Clay MCP',
    vendor: 'Clay',
    category: 'prospecting',
    description: "Company and contact enrichment and your workspace's Clay functions.",
    docsUrl: 'https://university.clay.com/docs/connect-to-clay-mcp',
  }),
  oauthConnector({
    id: 'gtm-common-room',
    name: 'Common Room MCP Server',
    vendor: 'Common Room',
    category: 'prospecting',
    description: 'Contacts, organizations, activities, segments and buying signals.',
    docsUrl: 'https://www.commonroom.io/docs/using-common-room/mcp-server/',
  }),
  oauthConnector({
    id: 'gtm-zendesk',
    name: 'Zendesk MCP server',
    vendor: 'Zendesk',
    category: 'customer-success',
    description: 'Tickets, users, organizations and help-center content.',
    docsUrl:
      'https://support.zendesk.com/hc/en-us/articles/11400026079130-Connecting-external-AI-agents-to-Zendesk-EAP',
  }),
  oauthConnector({
    id: 'gtm-slack',
    name: 'Slack MCP server',
    vendor: 'Slack',
    category: 'workspace',
    description: 'Messages, channels, threads and canvases for deal-room and account context.',
    docsUrl: 'https://docs.slack.dev/ai/slack-mcp-server',
    workaround: 'Until then: paste the Slack messages the app should work from into your message.',
  }),
  oauthConnector({
    id: 'gtm-asana',
    name: 'Asana MCP server',
    vendor: 'Asana',
    category: 'workspace',
    description: 'Projects, tasks and portfolios for onboarding, launch and campaign trackers.',
    docsUrl: 'https://developers.asana.com/docs/integrating-with-asanas-mcp-server',
  }),
  oauthConnector({
    id: 'gtm-bigquery',
    name: 'BigQuery remote MCP server',
    vendor: 'Google BigQuery',
    category: 'data-warehouse',
    description: 'Datasets, table schemas and SQL over your BigQuery pipeline and revenue data.',
    docsUrl: 'https://docs.cloud.google.com/bigquery/docs/use-bigquery-mcp',
  }),
  oauthConnector({
    id: 'gtm-amplitude',
    name: 'Amplitude MCP Server',
    vendor: 'Amplitude',
    category: 'analytics',
    description: 'Charts, funnels, retention, cohorts and experiments for product-usage views.',
    docsUrl: 'https://amplitude.com/docs/amplitude-ai/amplitude-mcp',
  }),
];

/** Token entries first, then the vendors that need an interactive sign-in. */
export const GTM_CONNECTORS: GtmConnector[] = [...TOKEN_CONNECTORS, ...OAUTH_CONNECTORS];

/** What to do until sign-in is supported: by default, attach a CSV export from the vendor. */
export function getOAuthWorkaround(connector: GtmOAuthConnector): string {
  return connector.workaround ?? `Until then: export a CSV from ${connector.vendor} and attach it to your message.`;
}

export function isTokenConnector(connector: GtmConnector): connector is GtmTokenConnector {
  return connector.auth === 'token';
}

export function isOAuthConnector(connector: GtmConnector): connector is GtmOAuthConnector {
  return connector.auth === 'oauth';
}

export function isSignInConnector(connector: GtmConnector): connector is GtmSignInConnector {
  return connector.auth === 'oauth' && connector.signIn !== undefined;
}

/** Entries this build can connect through the vendor's sign-in. */
export const GTM_SIGN_IN_CONNECTORS: GtmSignInConnector[] = GTM_CONNECTORS.filter(isSignInConnector);

export function getSignInConnector(id: unknown): GtmSignInConnector | undefined {
  return GTM_SIGN_IN_CONNECTORS.find((connector) => connector.id === id);
}

/** The named environment, or the default one when `value` is undefined. */
export function getSignInVariant(connector: GtmSignInConnector, value?: unknown): GtmSignInVariant | undefined {
  return value === undefined
    ? connector.signIn.variants[0]
    : connector.signIn.variants.find((variant) => variant.value === value);
}

export function getGtmConnectorCategoryLabel(id: GtmConnectorCategoryId): string {
  return GTM_CONNECTOR_CATEGORIES.find((category) => category.id === id)?.label ?? id;
}
