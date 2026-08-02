import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import pino from "pino";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AuthSession } from "../../../src/client/auth.js";
import { createHttpRequester } from "../../../src/client/http.js";
import {
  TaigaConflictError,
  TaigaRateLimitError,
  TaigaValidationError,
} from "../../../src/errors/taiga-error.js";

const BASE_URL = "https://taiga.example.test";
const silentLogger = () => pino({ level: "silent" });

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function tokenSession(token = "preset-token") {
  return new AuthSession({
    baseUrl: BASE_URL,
    credentials: { kind: "token", token },
    logger: silentLogger(),
  });
}

describe("createHttpRequester", () => {
  it("returns parsed JSON on a successful response", async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/projects/1`, () =>
        HttpResponse.json({ id: 1, version: 3 }),
      ),
    );

    const requester = createHttpRequester({
      baseUrl: BASE_URL,
      authSession: tokenSession(),
      logger: silentLogger(),
    });

    await expect(
      requester.request({ method: "GET", path: "/api/v1/projects/1" }),
    ).resolves.toEqual({ id: 1, version: 3 });
  });

  it("returns undefined for a 204 response", async () => {
    server.use(
      http.delete(
        `${BASE_URL}/api/v1/projects/1`,
        () => new HttpResponse(null, { status: 204 }),
      ),
    );

    const requester = createHttpRequester({
      baseUrl: BASE_URL,
      authSession: tokenSession(),
      logger: silentLogger(),
    });

    await expect(
      requester.request({ method: "DELETE", path: "/api/v1/projects/1" }),
    ).resolves.toBeUndefined();
  });

  it("refreshes once on 401 and retries the original request with the new token", async () => {
    server.use(
      http.post(`${BASE_URL}/api/v1/auth`, () =>
        HttpResponse.json({ auth_token: "token-1", refresh: "refresh-1" }),
      ),
      http.post(`${BASE_URL}/api/v1/auth/refresh`, () =>
        HttpResponse.json({ auth_token: "token-2", refresh: "refresh-2" }),
      ),
      http.get(`${BASE_URL}/api/v1/projects/1`, ({ request }) => {
        const auth = request.headers.get("authorization");
        if (auth === "Bearer token-1") {
          return new HttpResponse(null, { status: 401 });
        }
        expect(auth).toBe("Bearer token-2");
        return HttpResponse.json({ id: 1 });
      }),
    );

    const authSession = new AuthSession({
      baseUrl: BASE_URL,
      credentials: { kind: "password", username: "a", password: "b" },
      logger: silentLogger(),
    });
    const requester = createHttpRequester({
      baseUrl: BASE_URL,
      authSession,
      logger: silentLogger(),
    });

    await expect(
      requester.request({ method: "GET", path: "/api/v1/projects/1" }),
    ).resolves.toEqual({ id: 1 });
  });

  it("surfaces an auth error if the retry after refresh also 401s", async () => {
    server.use(
      http.post(`${BASE_URL}/api/v1/auth`, () =>
        HttpResponse.json({ auth_token: "token-1", refresh: "refresh-1" }),
      ),
      http.post(`${BASE_URL}/api/v1/auth/refresh`, () =>
        HttpResponse.json({ auth_token: "token-2", refresh: "refresh-2" }),
      ),
      http.get(
        `${BASE_URL}/api/v1/projects/1`,
        () => new HttpResponse(null, { status: 401 }),
      ),
    );

    const authSession = new AuthSession({
      baseUrl: BASE_URL,
      credentials: { kind: "password", username: "a", password: "b" },
      logger: silentLogger(),
    });
    const requester = createHttpRequester({
      baseUrl: BASE_URL,
      authSession,
      logger: silentLogger(),
    });

    await expect(
      requester.request({ method: "GET", path: "/api/v1/projects/1" }),
    ).rejects.toThrow(/authentication failed/i);
  });

  it("retries on 429 respecting Retry-After and eventually succeeds", async () => {
    let attempt = 0;
    server.use(
      http.get(`${BASE_URL}/api/v1/projects/1`, () => {
        attempt += 1;
        if (attempt < 3) {
          return new HttpResponse(null, {
            status: 429,
            headers: { "Retry-After": "0" },
          });
        }
        return HttpResponse.json({ id: 1 });
      }),
    );

    const requester = createHttpRequester({
      baseUrl: BASE_URL,
      authSession: tokenSession(),
      logger: silentLogger(),
    });

    await expect(
      requester.request({ method: "GET", path: "/api/v1/projects/1" }),
    ).resolves.toEqual({ id: 1 });
    expect(attempt).toBe(3);
  });

  it("throws TaigaRateLimitError once 429 retries are exhausted", async () => {
    server.use(
      http.get(
        `${BASE_URL}/api/v1/projects/1`,
        () =>
          new HttpResponse(null, {
            status: 429,
            headers: { "Retry-After": "0" },
          }),
      ),
    );

    const requester = createHttpRequester({
      baseUrl: BASE_URL,
      authSession: tokenSession(),
      logger: silentLogger(),
      maxRateLimitAttempts: 2,
    });

    await expect(
      requester.request({ method: "GET", path: "/api/v1/projects/1" }),
    ).rejects.toBeInstanceOf(TaigaRateLimitError);
  });

  it("returns undefined for a 200 response with an empty body", async () => {
    server.use(
      http.post(
        `${BASE_URL}/api/v1/user-stories/1/upvote`,
        () => new HttpResponse("", { status: 200 }),
      ),
    );

    const requester = createHttpRequester({
      baseUrl: BASE_URL,
      authSession: tokenSession(),
      logger: silentLogger(),
    });

    await expect(
      requester.request({
        method: "POST",
        path: "/api/v1/user-stories/1/upvote",
        body: {},
      }),
    ).resolves.toBeUndefined();
  });

  it("sends a FormData body as-is, without JSON-stringifying or overriding content-type", async () => {
    server.use(
      http.post(
        `${BASE_URL}/api/v1/user-stories/attachments`,
        async ({ request }) => {
          expect(request.headers.get("content-type")).toMatch(
            /^multipart\/form-data/,
          );
          const form = await request.formData();
          expect(form.get("object_id")).toBe("1");
          return HttpResponse.json({ id: 9 });
        },
      ),
    );

    const requester = createHttpRequester({
      baseUrl: BASE_URL,
      authSession: tokenSession(),
      logger: silentLogger(),
    });

    const form = new FormData();
    form.append("object_id", "1");

    await expect(
      requester.request({
        method: "POST",
        path: "/api/v1/user-stories/attachments",
        body: form,
      }),
    ).resolves.toEqual({ id: 9 });
  });

  it("maps a 400 body into structured field errors, never a flat string", async () => {
    server.use(
      http.post(`${BASE_URL}/api/v1/user-stories`, () =>
        HttpResponse.json(
          {
            subject: ["This field is required."],
            _error_message: "Validation failed",
          },
          { status: 400 },
        ),
      ),
    );

    const requester = createHttpRequester({
      baseUrl: BASE_URL,
      authSession: tokenSession(),
      logger: silentLogger(),
    });

    let caught: unknown;
    try {
      await requester.request({
        method: "POST",
        path: "/api/v1/user-stories",
        body: {},
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(TaigaValidationError);
    const structured = (caught as TaigaValidationError).toStructured();
    expect(structured.fields).toEqual([
      { field: "subject", messages: ["This field is required."] },
    ]);
    expect(structured.message).toBe("Validation failed");
  });

  it("maps Taiga's real OCC-conflict shape (400 + bare version string) to TaigaConflictError, not TaigaValidationError", async () => {
    // Confirmed live against the real API during phase 5 integration
    // testing: Taiga signals a version conflict as HTTP 400 with
    // {"version": "The version doesn't match with the current one"} —
    // a bare string, not the usual field-error array shape — never a
    // literal 409. Without this classification, updateWithVersion's
    // retry-on-conflict path (occ.ts) silently never triggers against
    // the real API no matter how solid its mocked-409 test coverage
    // looks (the exact failure mode ADR-005 exists to catch).
    server.use(
      http.patch(`${BASE_URL}/api/v1/user-stories/1`, () =>
        HttpResponse.json(
          { version: "The version doesn't match with the current one" },
          { status: 400 },
        ),
      ),
    );

    const requester = createHttpRequester({
      baseUrl: BASE_URL,
      authSession: tokenSession(),
      logger: silentLogger(),
    });

    await expect(
      requester.request({
        method: "PATCH",
        path: "/api/v1/user-stories/1",
        body: { version: 1, subject: "x" },
      }),
    ).rejects.toBeInstanceOf(TaigaConflictError);
  });

  it("still maps a literal 409 to TaigaConflictError, in case any deployment ever sends one", async () => {
    server.use(
      http.patch(
        `${BASE_URL}/api/v1/user-stories/1`,
        () => new HttpResponse(null, { status: 409 }),
      ),
    );

    const requester = createHttpRequester({
      baseUrl: BASE_URL,
      authSession: tokenSession(),
      logger: silentLogger(),
    });

    await expect(
      requester.request({
        method: "PATCH",
        path: "/api/v1/user-stories/1",
        body: { version: 1 },
      }),
    ).rejects.toBeInstanceOf(TaigaConflictError);
  });
});
