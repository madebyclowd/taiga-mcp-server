import { describe, expect, it } from "vitest";
import {
  connectedClient,
  fakeTaigaFetch,
  startTestHttpServer,
} from "./support.js";

function textOf(result: unknown): unknown {
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) throw new Error("expected a content array");
  const first = (content as unknown[])[0] as
    { type?: string; text?: string } | undefined;
  if (!first || first.type !== "text" || typeof first.text !== "string") {
    throw new Error("expected a text content block");
  }
  return JSON.parse(first.text) as unknown;
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
}

describe("HTTP transport: per-session credential isolation", () => {
  it("two sessions with different bearer tokens never see each other's credential", async () => {
    const fetchImpl = fakeTaigaFetch((url, init) => {
      if (url.pathname === "/api/v1/projects") {
        const auth = (init?.headers as Record<string, string> | undefined)?.[
          "authorization"
        ];
        return jsonResponse([{ id: 1, name: `seen:${auth}` }]);
      }
      return jsonResponse({ error: "unhandled" }, { status: 404 });
    });

    const testServer = await startTestHttpServer({ fetchImpl });
    try {
      const a = connectedClient(testServer.url, "token-A");
      const b = connectedClient(testServer.url, "token-B");
      await Promise.all([a.connect(), b.connect()]);

      expect(testServer.app.sessions.size).toBe(2);

      const [resultA, resultB] = await Promise.all([
        a.client.callTool({ name: "project_list", arguments: {} }),
        b.client.callTool({ name: "project_list", arguments: {} }),
      ]);

      expect(textOf(resultA)).toEqual([{ id: 1, name: "seen:Bearer token-A" }]);
      expect(textOf(resultB)).toEqual([{ id: 1, name: "seen:Bearer token-B" }]);

      await Promise.all([a.client.close(), b.client.close()]);
    } finally {
      await testServer.close();
    }
  });

  it("rejects a fresh session with no Authorization header", async () => {
    const testServer = await startTestHttpServer();
    try {
      const { connect } = connectedClient(testServer.url, undefined);
      await expect(connect()).rejects.toBeDefined();
      expect(testServer.app.sessions.size).toBe(0);
    } finally {
      await testServer.close();
    }
  });

  it("surfaces a Taiga 401 as a structured tool error, not a crash — token credentials cannot auto-refresh", async () => {
    const fetchImpl = fakeTaigaFetch(() => new Response(null, { status: 401 }));

    const testServer = await startTestHttpServer({ fetchImpl });
    try {
      const { client, connect } = connectedClient(testServer.url, "bad-token");
      await connect();

      const result = await client.callTool({
        name: "project_list",
        arguments: {},
      });

      expect(result.isError).toBe(true);
      await client.close();
    } finally {
      await testServer.close();
    }
  });
});

describe("HTTP transport: session lifecycle", () => {
  it("an idle session is swept once its TTL elapses", async () => {
    const testServer = await startTestHttpServer({ sessionTtlMs: 100 });
    try {
      const { connect } = connectedClient(testServer.url, "token-A");
      await connect();
      expect(testServer.app.sessions.size).toBe(1);

      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(testServer.app.sessions.size).toBe(0);
    } finally {
      await testServer.close();
    }
  });

  it("explicit session termination (DELETE) removes the session", async () => {
    const testServer = await startTestHttpServer();
    try {
      const { transport, connect } = connectedClient(testServer.url, "token-A");
      await connect();
      expect(testServer.app.sessions.size).toBe(1);

      await transport.terminateSession();

      expect(testServer.app.sessions.size).toBe(0);
    } finally {
      await testServer.close();
    }
  });

  it("an unknown Mcp-Session-Id is rejected with 404", async () => {
    const testServer = await startTestHttpServer();
    try {
      const response = await fetch(testServer.url, {
        method: "GET",
        headers: { "mcp-session-id": "does-not-exist" },
      });
      expect(response.status).toBe(404);
    } finally {
      await testServer.close();
    }
  });
});

describe("HTTP transport: hardening", () => {
  it("rejects an oversized request body with 413", async () => {
    const testServer = await startTestHttpServer({ maxBodyBytes: 100 });
    try {
      const response = await fetch(testServer.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ padding: "x".repeat(1000) }),
      });
      expect(response.status).toBe(413);
    } finally {
      await testServer.close();
    }
  });

  it("reflects an allowed origin and omits the header for a disallowed one", async () => {
    const testServer = await startTestHttpServer({
      allowedOrigins: ["https://allowed.example"],
    });
    try {
      const allowed = await fetch(testServer.url, {
        method: "OPTIONS",
        headers: { origin: "https://allowed.example" },
      });
      expect(allowed.headers.get("access-control-allow-origin")).toBe(
        "https://allowed.example",
      );

      const disallowed = await fetch(testServer.url, {
        method: "OPTIONS",
        headers: { origin: "https://evil.example" },
      });
      expect(disallowed.headers.get("access-control-allow-origin")).toBeNull();
    } finally {
      await testServer.close();
    }
  });
});
