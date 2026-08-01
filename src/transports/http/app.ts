import type { IncomingMessage, ServerResponse } from "node:http";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { Logger } from "pino";
import { SessionLimitError, SessionManager } from "./session.js";

export interface HttpAppOptions {
  baseUrl: string;
  sessionTtlMs: number;
  allowedOrigins: string[] | undefined;
  logger: Logger;
  /** Default 4 MiB — generous for MCP tool-call payloads, small enough to bound abuse. */
  maxBodyBytes?: number | undefined;
  /** Caps concurrent sessions to bound memory use from unauthenticated
   * session creation. Default 1000, see `session.ts`. */
  maxSessions?: number | undefined;
  /** Passed through to each session's `TaigaClient`; injectable for tests. */
  fetchImpl?: typeof fetch | undefined;
}

export interface HttpApp {
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
  sessions: SessionManager;
}

const DEFAULT_MAX_BODY_BYTES = 4 * 1024 * 1024;
const MCP_PATH = "/mcp";

class BodyTooLargeError extends Error {}

/**
 * Wires the MCP Streamable HTTP transport to a raw `node:http` request
 * handler. Deliberately no framework (express/etc.) — the routing
 * surface is one path, three methods, and CORS/size-limit headers,
 * which doesn't need a dependency to express.
 *
 * One `StreamableHTTPServerTransport` (and one session-scoped
 * `TaigaClient`) per session, per
 * ai-docs/01_architecture/taiga-mcp-adr-002-auth-and-credential-handling.md
 * — see `session.ts`. Existing sessions are routed by the
 * `Mcp-Session-Id` header; a request with no session id must be a
 * fresh `initialize` call carrying its own
 * `Authorization: Bearer <taiga-token>`.
 */
export function createHttpApp(options: HttpAppOptions): HttpApp {
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const sessions = new SessionManager({
    baseUrl: options.baseUrl,
    sessionTtlMs: options.sessionTtlMs,
    logger: options.logger,
    maxSessions: options.maxSessions,
    fetchImpl: options.fetchImpl,
  });

  async function handler(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    applyCors(req, res, options.allowedOrigins);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.url !== MCP_PATH) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    if (
      req.method !== "GET" &&
      req.method !== "POST" &&
      req.method !== "DELETE"
    ) {
      res.writeHead(405, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }

    const sessionIdHeader = req.headers["mcp-session-id"];
    const sessionId = Array.isArray(sessionIdHeader)
      ? sessionIdHeader[0]
      : sessionIdHeader;

    if (sessionId !== undefined) {
      const session = sessions.get(sessionId);
      if (!session) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Unknown or expired session" }));
        return;
      }
      await session.transport.handleRequest(req, res);
      return;
    }

    if (req.method !== "POST") {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Missing Mcp-Session-Id header" }));
      return;
    }

    let body: unknown;
    try {
      body = await readJsonBody(req, maxBodyBytes);
    } catch (error) {
      if (error instanceof BodyTooLargeError) {
        res.writeHead(413, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Request body too large" }));
        return;
      }
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON body" }));
      return;
    }

    if (!isInitializeRequest(body)) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: "First request on a new session must be MCP initialize",
        }),
      );
      return;
    }

    const token = extractBearerToken(req);
    if (!token) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Missing Authorization: Bearer <taiga-token> header",
        }),
      );
      return;
    }

    let transport: Awaited<ReturnType<SessionManager["create"]>>["transport"];
    try {
      ({ transport } = await sessions.create(token));
    } catch (error) {
      if (error instanceof SessionLimitError) {
        res.writeHead(503, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: error.message }));
        return;
      }
      throw error;
    }
    await transport.handleRequest(req, res, body);
  }

  return { handler, sessions };
}

function applyCors(
  req: IncomingMessage,
  res: ServerResponse,
  allowedOrigins: string[] | undefined,
): void {
  const origin = req.headers.origin;
  if (typeof origin !== "string") return;
  if (allowedOrigins && !allowedOrigins.includes(origin)) return;

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, Mcp-Session-Id",
  );
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
}

function extractBearerToken(req: IncomingMessage): string | undefined {
  const header = req.headers.authorization;
  if (typeof header !== "string") return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1];
}

function readJsonBody(
  req: IncomingMessage,
  maxBytes: number,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let tooLarge = false;

    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        // Don't destroy the socket here — the caller still needs to
        // write a 413 response on this same connection. Just stop
        // buffering; the (discarded) rest of the body still drains.
        if (!tooLarge) {
          tooLarge = true;
          reject(new BodyTooLargeError("Request body exceeds limit"));
        }
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (tooLarge) return;
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(text.length === 0 ? undefined : JSON.parse(text));
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
    req.on("error", reject);
  });
}
