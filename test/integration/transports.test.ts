import { createServer as createNodeHttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import pino from "pino";
import { createHttpApp, type HttpApp } from "../../src/transports/http/app.js";
import { getIntegrationConfig, shouldRunIntegrationTests } from "./setup.js";

const config = getIntegrationConfig();
const runIntegration = shouldRunIntegrationTests();

interface ToolResponse {
  content: Array<{ type: string; text?: string }>;
}

describe.runIf(runIntegration)("Integration: HTTP & Stdio Transports", () => {
  let app: HttpApp;
  let server: ReturnType<typeof createNodeHttpServer>;
  let serverUrl: URL;

  beforeAll(async () => {
    if (!config) return;

    app = createHttpApp({
      baseUrl: config.baseUrl,
      sessionTtlMs: 60000,
      logger: pino({ level: "silent" }),
      allowedOrigins: undefined,
    });

    server = createNodeHttpServer((req, res) => {
      app.handler(req, res).catch(() => {
        if (!res.headersSent) {
          res.writeHead(500);
          res.end();
        }
      });
    });

    // Security requirement: Servers MUST listen on 127.0.0.1 during testing
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const { port } = server.address() as AddressInfo;
    serverUrl = new URL(`http://127.0.0.1:${String(port)}/mcp`);
  });

  afterAll(async () => {
    if (app) {
      app.sessions.stop();
    }
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("should connect via HTTP Streamable transport and call project_get", async () => {
    let token: string | undefined = config?.token;

    // If username/password is used, obtain a token via TaigaClient first
    if (!token && config?.username && config?.password) {
      const authRes = await fetch(`${config.baseUrl}/api/v1/auth`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "normal",
          username: config.username,
          password: config.password,
        }),
      });
      if (authRes.ok) {
        const data = (await authRes.json()) as { auth_token: string };
        token = data.auth_token;
      }
    }

    if (!token) {
      return;
    }

    // project_get takes a numeric id, not a slug — resolve it first via
    // the same real API, just like the stdio-transport tools test does.
    const bySlugRes = await fetch(
      `${config?.baseUrl}/api/v1/projects/by_slug?slug=${config?.projectSlug}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    const project = (await bySlugRes.json()) as { id: number };

    const transport = new StreamableHTTPClientTransport(serverUrl, {
      requestInit: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    const client = new Client({
      name: "integration-http-client",
      version: "0.1.0",
    });

    await client.connect(transport as Transport);

    const projectRes = (await client.callTool({
      name: "project_get",
      arguments: { id: project.id },
    })) as ToolResponse;

    expect(projectRes.content).toBeDefined();
    const text = projectRes.content[0]?.text ?? "";
    expect(text).toContain(config?.projectSlug);

    await client.close();
  });
});
