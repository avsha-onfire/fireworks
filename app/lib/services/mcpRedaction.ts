import type { ToolSet } from 'ai';
import type { MCPServerTools } from './mcpService';

/** Stands in for every secret sent to the browser or written to the log. */
export const REDACTED_VALUE = '••••';

export type RedactedMCPServerConfig = {
  type?: string;
  url?: string;
  command?: string;
  args?: string[];
  headers?: Record<string, string>;
  env?: Record<string, string>;
};

export type RedactedMCPServer =
  | { status: 'available'; tools: ToolSet; config: RedactedMCPServerConfig }
  | { status: 'unavailable'; error: string; config: RedactedMCPServerConfig };

export type RedactedMCPServerTools = Record<string, RedactedMCPServer>;

/* The scheme is capped so that scanning long error text stays linear. */
const URL_SCHEME = /^[a-z][a-z0-9+.-]{0,31}:\/\//i;
const URL_IN_TEXT = /\b[a-z][a-z0-9+.-]{0,31}:\/\/[^\s"'<>`()[\]{}]+/gi;
const URL_PARAM = /([?#&])([^&#=]*)=([^&#]*)/g;

/** Flags whose next argument is a credential, such as `--api-key <value>`. */
const SECRET_FLAG = /^-.*(?:token|key|secret|passw(?:or)?d|pwd|auth|bearer|credential|cookie|session)/i;
const HEADER_FLAG = /^(?:-H|--headers?)$/;
const AUTH_SCHEME = /^(?:bearer|basic)$/i;
const AUTH_PAIR = /\b(bearer|basic)(\s+)([^\s"',;]+)/gi;
const HEADER_LINE = /^([^:]+:\s*)(.*)$/s;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function maskValues(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return Object.fromEntries(Object.keys(value).map((key) => [key, REDACTED_VALUE]));
}

function collectStrings(value: unknown, found: string[], depth = 0): void {
  if (typeof value === 'string') {
    const text = value.trim();

    if (text) {
      found.push(text);
    }

    return;
  }

  if (typeof value !== 'object' || value === null || depth > 4) {
    return;
  }

  for (const nested of Object.values(value)) {
    collectStrings(nested, found, depth + 1);
  }
}

/** Records a secret as written and, for URL parts, as an error would print it decoded. */
function addSecret(found: string[], value: string): void {
  collectStrings(value, found);

  try {
    const decoded = decodeURIComponent(value);

    if (decoded !== value) {
      collectStrings(decoded, found);
    }
  } catch {
    // Not percent-encoded; the value as written is already recorded.
  }
}

/*
 * Masks the user name and password and every query or fragment value, and
 * keeps the scheme, host and path so the server can still be recognised.
 * Works on the text as written, so a URL that does not parse is still masked.
 */
function maskUrl(url: string, found: string[]): string {
  const scheme = URL_SCHEME.exec(url)?.[0] ?? '';
  const rest = url.slice(scheme.length);
  const authorityEnd = rest.search(/[/?#]/);
  const authority = authorityEnd === -1 ? rest : rest.slice(0, authorityEnd);
  const userinfoEnd = scheme ? authority.lastIndexOf('@') : -1;
  const tail = rest.slice(authority.length);
  const paramsStart = tail.search(/[?#]/);
  const path = paramsStart === -1 ? tail : tail.slice(0, paramsStart);
  const params = paramsStart === -1 ? '' : tail.slice(paramsStart);

  if (userinfoEnd !== -1) {
    const userinfo = authority.slice(0, userinfoEnd);

    addSecret(found, userinfo);
    userinfo.split(':').forEach((part) => addSecret(found, part));
  }

  const maskedParams = params.replace(URL_PARAM, (_match, separator: string, name: string, value: string) => {
    addSecret(found, value);
    return `${separator}${name}=${value ? REDACTED_VALUE : ''}`;
  });

  const userinfo = userinfoEnd === -1 ? '' : `${REDACTED_VALUE}@`;

  return `${scheme}${userinfo}${authority.slice(userinfoEnd + 1)}${path}${maskedParams}`;
}

function maskAuthPairs(text: string, found: string[]): string {
  return text.replace(AUTH_PAIR, (_match, scheme: string, space: string, credential: string) => {
    addSecret(found, credential);
    return `${scheme}${space}${REDACTED_VALUE}`;
  });
}

/*
 * Command lines carry credentials in several shapes: `--name=value`,
 * `--api-key value`, `--header "Authorization: Bearer value"`, a URL with a
 * token, or `Bearer value`. Every value after `=` is masked, not only those of
 * flags with a telling name, because names such as `--dsn` cannot be listed
 * in advance. Flag names stay visible.
 */
function maskArgs(args: string[], found: string[]): string[] {
  return args.map((arg, index) => {
    const previous = index > 0 ? args[index - 1] : '';

    if ((SECRET_FLAG.test(previous) && !previous.includes('=')) || AUTH_SCHEME.test(previous)) {
      addSecret(found, arg);
      return REDACTED_VALUE;
    }

    if (HEADER_FLAG.test(previous)) {
      const header = HEADER_LINE.exec(arg);

      addSecret(found, header ? header[2] : arg);

      return header ? `${header[1]}${REDACTED_VALUE}` : REDACTED_VALUE;
    }

    if (URL_SCHEME.test(arg)) {
      return maskUrl(arg, found);
    }

    const equals = arg.indexOf('=');

    if (equals !== -1) {
      const value = arg.slice(equals + 1);

      addSecret(found, value);

      return value ? `${arg.slice(0, equals + 1)}${REDACTED_VALUE}` : arg;
    }

    return maskAuthPairs(arg, found);
  });
}

/*
 * The service keeps each server entry exactly as it was posted, including
 * entries that failed validation, so a config can have any shape. Building the
 * copy from an allow-list means an unexpected field can never carry a secret
 * through.
 */
function redactServerConfig(config: unknown): RedactedMCPServerConfig {
  if (!isRecord(config)) {
    return {};
  }

  const redacted: RedactedMCPServerConfig = {};

  for (const field of ['type', 'command'] as const) {
    const value = config[field];

    if (typeof value === 'string') {
      redacted[field] = value;
    }
  }

  if (typeof config.url === 'string') {
    redacted.url = maskUrl(config.url, []);
  }

  if (isStringArray(config.args)) {
    redacted.args = maskArgs(config.args, []);
  }

  const headers = maskValues(config.headers);

  if (headers) {
    redacted.headers = headers;
  }

  const env = maskValues(config.env);

  if (env) {
    redacted.env = env;
  }

  return redacted;
}

function configSecrets(config: unknown): string[] {
  const found: string[] = [];

  if (!isRecord(config)) {
    return found;
  }

  collectStrings(config.headers, found);
  collectStrings(config.env, found);

  if (typeof config.url === 'string') {
    maskUrl(config.url, found);
  }

  if (isStringArray(config.args)) {
    maskArgs(config.args, found);
  }

  return found;
}

function errorText(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }

  if (!(error instanceof Error)) {
    return '';
  }

  return error.cause instanceof Error ? `${error.message} (cause: ${error.cause.message})` : error.message;
}

/**
 * Returns the message of a connection error with the server's secrets masked.
 *
 * Such a message may quote what was sent: the HTTP client, for one, quotes a
 * header value it refuses. Every header and environment value, and every
 * credential found in the URL or the arguments, is therefore masked, longest
 * first so that a value containing another is masked whole; URLs quoted in
 * the text are masked as in the config. This is deliberately strict: a short
 * value such as `1` is masked wherever it occurs. Accepts a string or an
 * `Error` (whose message, and that of its cause, is used); anything else
 * gives an empty string.
 */
export function redactErrorText(error: unknown, config: unknown): string {
  const masked = configSecrets(config)
    .sort((a, b) => b.length - a.length)
    .reduce((text, secret) => text.split(secret).join(REDACTED_VALUE), errorText(error));

  return masked.replace(URL_IN_TEXT, (url) => {
    // Punctuation that ends the sentence is not part of the URL.
    let end = url.length;

    while (end > 0 && '.,;:!?'.includes(url[end - 1])) {
      end--;
    }

    return `${maskUrl(url.slice(0, end), [])}${url.slice(end)}`;
  });
}

/**
 * Returns the copy of the server list that is safe to send to the browser.
 *
 * The `client` handle is dropped because it holds the transport, and with it
 * the request headers. Header and environment names are kept so the UI can
 * show what is configured; their values are masked, as are credentials in the
 * URL and the arguments, in the configuration and in the error text of an
 * unavailable server. The input is not modified: the service still needs the
 * real values to connect and to call tools.
 */
export function redactMcpServerTools(serverTools: MCPServerTools): RedactedMCPServerTools {
  return Object.fromEntries(
    Object.entries(serverTools).map(([serverName, server]): [string, RedactedMCPServer] => {
      const config = redactServerConfig(server.config);

      return [
        serverName,
        server.status === 'available'
          ? { status: server.status, tools: server.tools, config }
          : { status: server.status, error: redactErrorText(server.error, server.config), config },
      ];
    }),
  );
}
