import type { AuthorizationServerMetadata } from '@modelcontextprotocol/sdk/shared/auth.js';

/*
 * Server-side memory for vendor sign-ins.
 *
 * A session is one browser, named by a random id in an HttpOnly cookie. Each
 * session holds its own connections, so a visitor without the cookie can
 * neither see nor use them. Nothing here is written to disk: a restart signs
 * everyone out.
 */

export interface StoredTokens {
  accessToken: string;
  refreshToken?: string;

  /** Epoch milliseconds; unknown when the vendor sends no `expires_in`. */
  expiresAt?: number;
}

/** Where a connection points, fixed at sign-in from checked discovery. */
export interface ConnectionTarget {
  connectorId: string;
  variant: string;
  serverUrl: string;

  /** RFC 8707 resource indicator, spelled as the server's metadata spells it. */
  resource: string;
  authorizationServerUrl: string;
  metadata: AuthorizationServerMetadata;
}

export interface OAuthConnection extends ConnectionTarget {
  status: 'connected' | 'needs-sign-in';
  tokens?: StoredTokens;
  connectedAt: number;

  /** New for every sign-in, so a cached client can tell a new sign-in from a refresh. */
  signInId: string;
}

export interface PendingSignIn extends ConnectionTarget {
  sessionId: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
  createdAt: number;
}

export interface OAuthSession {
  readonly id: string;
  lastSeenAt: number;
  readonly connections: Map<string, OAuthConnection>;
}

export interface StoreLimits {
  maxSessions: number;
  maxPending: number;
  pendingTtlMs: number;
  sessionIdleMs: number;
}

export const DEFAULT_STORE_LIMITS: StoreLimits = {
  maxSessions: 1000,
  maxPending: 200,
  pendingTtlMs: 10 * 60 * 1000,
  sessionIdleMs: 30 * 24 * 60 * 60 * 1000,
};

/** 32 random bytes, base64url without padding (43 characters). */
export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));

  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export class OAuthSessionStore {
  private readonly _sessions = new Map<string, OAuthSession>();
  private readonly _pending = new Map<string, PendingSignIn>();

  constructor(
    private readonly _now: () => number = () => Date.now(),
    private readonly _limits: StoreLimits = DEFAULT_STORE_LIMITS,
  ) {}

  /** The live session with this id. A session is never created from an id the browser sent. */
  getSession(id: string | undefined): OAuthSession | undefined {
    const session = id ? this._sessions.get(id) : undefined;

    if (!session) {
      return undefined;
    }

    if (this._now() - session.lastSeenAt > this._limits.sessionIdleMs) {
      this._sessions.delete(session.id);
      return undefined;
    }

    session.lastSeenAt = this._now();

    // Re-inserted so the map stays ordered from least to most recently seen.
    this._sessions.delete(session.id);
    this._sessions.set(session.id, session);

    return session;
  }

  createSession(): OAuthSession {
    this._makeRoomForSession();

    const session: OAuthSession = { id: randomToken(), lastSeenAt: this._now(), connections: new Map() };

    this._sessions.set(session.id, session);

    return session;
  }

  addPending(state: string, flow: Omit<PendingSignIn, 'createdAt'>): void {
    this._dropExpiredPending();

    while (this._pending.size >= this._limits.maxPending) {
      const oldest = this._pending.keys().next().value;

      if (oldest === undefined) {
        break;
      }

      this._pending.delete(oldest);
    }

    this._pending.set(state, { ...flow, createdAt: this._now() });
  }

  /** Removes and returns the pending sign-in for `state`, so each one completes at most once. */
  takePending(state: string): PendingSignIn | undefined {
    const flow = this._pending.get(state);

    this._pending.delete(state);

    if (!flow || this._now() - flow.createdAt > this._limits.pendingTtlMs) {
      return undefined;
    }

    return flow;
  }

  getConnection(sessionId: string, connectorId: string): OAuthConnection | undefined {
    return this._sessions.get(sessionId)?.connections.get(connectorId);
  }

  setConnection(sessionId: string, connection: OAuthConnection): void {
    const session = this._sessions.get(sessionId);

    if (!session) {
      throw new Error('The sign-in session no longer exists.');
    }

    session.connections.set(connection.connectorId, connection);
  }

  deleteConnection(sessionId: string, connectorId: string): OAuthConnection | undefined {
    const connections = this._sessions.get(sessionId)?.connections;
    const connection = connections?.get(connectorId);

    connections?.delete(connectorId);

    return connection;
  }

  private _makeRoomForSession(): void {
    const now = this._now();

    for (const [id, session] of this._sessions) {
      if (now - session.lastSeenAt > this._limits.sessionIdleMs) {
        this._sessions.delete(id);
      }
    }

    if (this._sessions.size < this._limits.maxSessions) {
      return;
    }

    // Least recently seen first, and sessions without a connection before signed-in ones.
    const sessions = [...this._sessions.values()];
    const victim = sessions.find((session) => session.connections.size === 0) ?? sessions[0];

    if (victim) {
      this._sessions.delete(victim.id);
    }
  }

  private _dropExpiredPending(): void {
    const now = this._now();

    for (const [state, flow] of this._pending) {
      if (now - flow.createdAt > this._limits.pendingTtlMs) {
        this._pending.delete(state);
      }
    }
  }
}

const STORE_KEY = Symbol.for('mcp-oauth.session-store');

/**
 * The process-wide store. Kept on `globalThis` so that reloading this module
 * during development does not sign everyone out.
 */
export function getOAuthStore(): OAuthSessionStore {
  const holder = globalThis as unknown as Record<symbol, OAuthSessionStore | undefined>;

  holder[STORE_KEY] ??= new OAuthSessionStore();

  return holder[STORE_KEY];
}
