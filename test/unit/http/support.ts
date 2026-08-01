import { createServer as createNodeHttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import pino from "pino";
import { createHttpApp, type HttpApp } from "../../../src/http/app.js";

export const BASE_URL = "https://taiga.example.test";

export interface TestHttpServer {
  app: HttpApp;
  url: URL;
  close: () => Promise<void>;
}

export async function startTestHttpServer(
  overrides: {
    sessionTtlMs?: number;
    allowedOrigins?: string[] | undefined;
    maxBodyBytes?: number;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<TestHttpServer> {
  const app = createHttpApp({
    baseUrl: BASE_URL,
    sessionTtlMs: overrides.sessionTtlMs ?? 5 * 60 * 1000,
    allowedOrigins: overrides.allowedOrigins,
    maxBodyBytes: overrides.maxBodyBytes,
    fetchImpl: overrides.fetchImpl,
    logger: pino({ level: "silent" }),
  });

  const server = createNodeHttpServer((req, res) => {
    app.handler(req, res).catch(() => {
      res.writeHead(500);
      res.end();
    });
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  const url = new URL(`http://127.0.0.1:${String(port)}/mcp`);

  return {
    app,
    url,
    close: () =>
      new Promise<void>((resolve) => {
        app.sessions.stop();
        server.close(() => resolve());
      }),
  };
}

export interface TestClient {
  client: Client;
  transport: StreamableHTTPClientTransport;
  /** Same `Transport`-vs-accessor-property type mismatch as `session.ts` — see the comment there. */
  connect: () => Promise<void>;
}

/**
 * Stubs the Taiga-side `fetch` directly rather than mocking the network
 * via msw. Deliberate: the MCP client opens a long-lived standalone SSE
 * stream as part of `connect()`, and msw's global fetch interceptor
 * (even in passthrough mode) never resolves that promise for a
 * genuinely long-lived local stream — confirmed outside vitest with
 * plain `fetch()` too, so this is an msw/interceptor limitation with
 * long-lived streams, not a bug in the server. Stubbing `fetchImpl`
 * (already supported by `TaigaClient` for exactly this purpose) sidesteps
 * it entirely and is simpler for these tests anyway, since they're
 * about session/credential isolation, not Taiga's HTTP behavior.
 */
export function fakeTaigaFetch(
  handler: (
    url: URL,
    init: RequestInit | undefined,
  ) => Response | Promise<Response>,
): typeof fetch {
  return async (input, init) => {
    const url =
      typeof input === "string"
        ? new URL(input)
        : input instanceof URL
          ? input
          : new URL(input.url);
    return handler(url, init);
  };
}

export function connectedClient(
  url: URL,
  token: string | undefined,
): TestClient {
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: token ? { headers: { Authorization: `Bearer ${token}` } } : {},
  });
  const client = new Client({ name: "test-client", version: "0.0.1" });
  return {
    client,
    transport,
    connect: () => client.connect(transport as Transport),
  };
}
