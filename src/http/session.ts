import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { Logger } from "pino";
import { TaigaClient } from "../client/taiga-client.js";
import { createServer } from "../server.js";

export interface HttpSession {
  id: string;
  transport: StreamableHTTPServerTransport;
  client: TaigaClient;
  lastActivityAt: number;
}

export interface SessionManagerOptions {
  baseUrl: string;
  sessionTtlMs: number;
  logger: Logger;
  /** Injectable for tests; defaults to `Date.now`. */
  now?: () => number;
  /** Passed through to each session's `TaigaClient`; injectable for tests. */
  fetchImpl?: typeof fetch | undefined;
}

/**
 * Owns every session-scoped `TaigaClient` for the HTTP transport. Each
 * session gets its own client built from that session's own bearer
 * token — never shared or reused across sessions — per
 * ai-docs/01_architecture/taiga-mcp-adr-002-auth-and-credential-handling.md.
 * `destroy` (called on explicit close, transport close, or TTL sweep)
 * drops the map entry, which is the only place the client/credential is
 * referenced, so it becomes unreachable and eligible for GC — no
 * lingering credential storage.
 */
export class SessionManager {
  private readonly sessions = new Map<string, HttpSession>();
  private readonly sweepTimer: ReturnType<typeof setInterval>;
  private readonly now: () => number;

  constructor(private readonly options: SessionManagerOptions) {
    this.now = options.now ?? (() => Date.now());
    this.sweepTimer = setInterval(
      () => this.sweepExpired(),
      Math.min(options.sessionTtlMs, 60_000),
    );
    this.sweepTimer.unref();
  }

  /** Creates a new session-scoped client + transport from a bearer token. Caller must still call `transport.handleRequest(...)` on the initialize request. */
  async create(
    token: string,
  ): Promise<{ transport: StreamableHTTPServerTransport }> {
    const client = new TaigaClient({
      baseUrl: this.options.baseUrl,
      credentials: { kind: "token", token },
      logger: this.options.logger,
      fetchImpl: this.options.fetchImpl,
    });
    const server = createServer(client);

    let sessionId: string | undefined;
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        sessionId = id;
        this.sessions.set(id, {
          id,
          transport,
          client,
          lastActivityAt: this.now(),
        });
      },
      onsessionclosed: (id) => {
        this.destroy(id);
      },
    });
    transport.onclose = () => {
      if (sessionId) this.destroy(sessionId);
    };

    // StreamableHTTPServerTransport declares `onclose`/`onerror`/`onmessage`
    // as `(() => void) | undefined` accessors, while `Transport` declares
    // them as plain optional properties (`?: () => void`) — an upstream
    // SDK type inconsistency that only this transport class has (stdio's
    // does not). Structurally identical at runtime; cast to sidestep it.
    //
    // Must be awaited: `connect()` is what wires `transport.onmessage` to
    // the `McpServer` instance. The caller immediately feeds the
    // in-flight `initialize` request into this same transport — if that
    // happens before `onmessage` is wired, the message is silently
    // dropped and the client hangs waiting for a response that will
    // never come.
    await server.connect(transport as Transport);
    return { transport };
  }

  get(id: string): HttpSession | undefined {
    const session = this.sessions.get(id);
    if (session) session.lastActivityAt = this.now();
    return session;
  }

  destroy(id: string): void {
    this.sessions.delete(id);
  }

  get size(): number {
    return this.sessions.size;
  }

  private sweepExpired(): void {
    const cutoff = this.now() - this.options.sessionTtlMs;
    for (const [id, session] of this.sessions) {
      if (session.lastActivityAt < cutoff) {
        void session.transport.close();
        this.sessions.delete(id);
      }
    }
  }

  /** Stops the TTL sweep and closes every open session — call on server shutdown. */
  stop(): void {
    clearInterval(this.sweepTimer);
    for (const session of this.sessions.values()) {
      void session.transport.close();
    }
    this.sessions.clear();
  }
}
