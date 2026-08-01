import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import pino from "pino";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AuthSession } from "../../../src/client/auth.js";

const BASE_URL = "https://taiga.example.test";
const silentLogger = () => pino({ level: "silent" });

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("AuthSession", () => {
  it("exchanges username/password for a token on first getToken()", async () => {
    server.use(
      http.post(`${BASE_URL}/api/v1/auth`, async ({ request }) => {
        const body = await request.json();
        expect(body).toMatchObject({
          type: "normal",
          username: "alice",
          password: "secret",
        });
        return HttpResponse.json({
          auth_token: "token-1",
          refresh: "refresh-1",
        });
      }),
    );

    const session = new AuthSession({
      baseUrl: BASE_URL,
      credentials: { kind: "password", username: "alice", password: "secret" },
      logger: silentLogger(),
    });

    await expect(session.getToken()).resolves.toBe("token-1");
  });

  it("uses a manually supplied token directly, with no exchange call", async () => {
    server.use(
      http.post(`${BASE_URL}/api/v1/auth`, () => {
        throw new Error(
          "must not call the login endpoint for token credentials",
        );
      }),
    );

    const session = new AuthSession({
      baseUrl: BASE_URL,
      credentials: { kind: "token", token: "preset-token" },
      logger: silentLogger(),
    });

    await expect(session.getToken()).resolves.toBe("preset-token");
  });

  it("concurrent getToken() calls before exchange resolves share one login request", async () => {
    let loginCalls = 0;
    server.use(
      http.post(`${BASE_URL}/api/v1/auth`, async () => {
        loginCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return HttpResponse.json({
          auth_token: "token-1",
          refresh: "refresh-1",
        });
      }),
    );

    const session = new AuthSession({
      baseUrl: BASE_URL,
      credentials: { kind: "password", username: "alice", password: "secret" },
      logger: silentLogger(),
    });

    const [a, b] = await Promise.all([session.getToken(), session.getToken()]);
    expect(a).toBe("token-1");
    expect(b).toBe("token-1");
    expect(loginCalls).toBe(1);
  });

  it("refresh() exchanges the refresh token for a new token pair", async () => {
    server.use(
      http.post(`${BASE_URL}/api/v1/auth`, () =>
        HttpResponse.json({ auth_token: "token-1", refresh: "refresh-1" }),
      ),
      http.post(`${BASE_URL}/api/v1/auth/refresh`, async ({ request }) => {
        const body = (await request.json()) as { refresh: string };
        expect(body.refresh).toBe("refresh-1");
        return HttpResponse.json({
          auth_token: "token-2",
          refresh: "refresh-2",
        });
      }),
    );

    const session = new AuthSession({
      baseUrl: BASE_URL,
      credentials: { kind: "password", username: "alice", password: "secret" },
      logger: silentLogger(),
    });

    await session.getToken();
    await expect(session.refresh()).resolves.toBe("token-2");
  });

  it("refresh() falls back to a full re-exchange if the refresh token itself is rejected", async () => {
    let loginCalls = 0;
    server.use(
      http.post(`${BASE_URL}/api/v1/auth`, () => {
        loginCalls += 1;
        return HttpResponse.json({
          auth_token: `token-${loginCalls}`,
          refresh: `refresh-${loginCalls}`,
        });
      }),
      http.post(
        `${BASE_URL}/api/v1/auth/refresh`,
        () => new HttpResponse(null, { status: 401 }),
      ),
    );

    const session = new AuthSession({
      baseUrl: BASE_URL,
      credentials: { kind: "password", username: "alice", password: "secret" },
      logger: silentLogger(),
    });

    await session.getToken();
    await expect(session.refresh()).resolves.toBe("token-2");
    expect(loginCalls).toBe(2);
  });

  it("refresh() rejects immediately for a manually supplied token, without looping", async () => {
    const session = new AuthSession({
      baseUrl: BASE_URL,
      credentials: { kind: "token", token: "preset-token" },
      logger: silentLogger(),
    });

    await expect(session.refresh()).rejects.toThrow(
      /cannot be refreshed automatically/,
    );
  });
});
