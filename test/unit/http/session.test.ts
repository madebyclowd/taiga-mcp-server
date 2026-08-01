import pino from "pino";
import { describe, expect, it } from "vitest";
import { SessionManager } from "../../../src/transports/http/session.js";
import {
  connectedClient,
  fakeTaigaFetch,
  startTestHttpServer,
  BASE_URL,
} from "./support.js";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
}

describe("SessionManager: direct unit behavior", () => {
  it("get() returns undefined and destroy() is a no-op for an unknown id", () => {
    const manager = new SessionManager({
      baseUrl: BASE_URL,
      sessionTtlMs: 60_000,
      logger: pino({ level: "silent" }),
    });
    try {
      expect(manager.get("does-not-exist")).toBeUndefined();
      expect(() => manager.destroy("does-not-exist")).not.toThrow();
      expect(manager.size).toBe(0);
    } finally {
      manager.stop();
    }
  });

  it("stop() clears the sweep timer and any open sessions without throwing", () => {
    const manager = new SessionManager({
      baseUrl: BASE_URL,
      sessionTtlMs: 60_000,
      logger: pino({ level: "silent" }),
    });
    expect(() => manager.stop()).not.toThrow();
    expect(manager.size).toBe(0);
    // stop() must be idempotent — server shutdown paths may call it once
    // explicitly and once more via a finally block.
    expect(() => manager.stop()).not.toThrow();
  });
});

describe("HTTP transport: session cap", () => {
  it("rejects a session past the configured maxSessions with 503", async () => {
    const fetchImpl = fakeTaigaFetch(() => jsonResponse([]));
    const testServer = await startTestHttpServer({ maxSessions: 1, fetchImpl });
    try {
      const first = connectedClient(testServer.url, "token-A");
      await first.connect();
      expect(testServer.app.sessions.size).toBe(1);

      const second = connectedClient(testServer.url, "token-B");
      await expect(second.connect()).rejects.toBeDefined();
      expect(testServer.app.sessions.size).toBe(1);

      await first.client.close();
    } finally {
      await testServer.close();
    }
  });

  it("accepts a new session again once one under the cap closes", async () => {
    const fetchImpl = fakeTaigaFetch(() => jsonResponse([]));
    const testServer = await startTestHttpServer({ maxSessions: 1, fetchImpl });
    try {
      const first = connectedClient(testServer.url, "token-A");
      await first.connect();
      await first.transport.terminateSession();
      expect(testServer.app.sessions.size).toBe(0);

      const second = connectedClient(testServer.url, "token-B");
      await second.connect();
      expect(testServer.app.sessions.size).toBe(1);

      await second.client.close();
    } finally {
      await testServer.close();
    }
  });
});
