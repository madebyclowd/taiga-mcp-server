import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import pino from "pino";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AuthSession } from "../../../src/client/auth.js";
import { createHttpRequester } from "../../../src/client/http.js";
import { updateWithVersion } from "../../../src/client/occ.js";
import { TaigaConflictError } from "../../../src/errors/taiga-error.js";

const BASE_URL = "https://taiga.example.test";
const silentLogger = () => pino({ level: "silent" });

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function makeRequester() {
  const authSession = new AuthSession({
    baseUrl: BASE_URL,
    credentials: { kind: "token", token: "t" },
    logger: silentLogger(),
  });
  return createHttpRequester({
    baseUrl: BASE_URL,
    authSession,
    logger: silentLogger(),
  });
}

describe("updateWithVersion", () => {
  it("fetches the current version and PATCHes with it", async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/user-stories/42`, () =>
        HttpResponse.json({ id: 42, version: 5, subject: "old" }),
      ),
      http.patch(`${BASE_URL}/api/v1/user-stories/42`, async ({ request }) => {
        const body = (await request.json()) as {
          version: number;
          subject: string;
        };
        expect(body.version).toBe(5);
        return HttpResponse.json({ id: 42, version: 6, subject: body.subject });
      }),
    );

    const result = await updateWithVersion(
      makeRequester(),
      "/api/v1/user-stories/42",
      {
        subject: "new",
      },
    );

    expect(result).toEqual({ id: 42, version: 6, subject: "new" });
  });

  it("retries once on a real Taiga OCC conflict (400 + bare version string) with a freshly fetched version", async () => {
    // Taiga signals a version conflict as 400 + {"version": "..."} (a
    // bare string, not the usual field-error array), never a literal
    // 409 — confirmed live during phase 5 integration testing. Mocking
    // a literal 409 here would test a shape the real API never sends,
    // exactly the self-consistent-mock risk ADR-005 exists to catch.
    let getCount = 0;
    let patchAttempt = 0;
    server.use(
      http.get(`${BASE_URL}/api/v1/user-stories/42`, () => {
        getCount += 1;
        return HttpResponse.json({ id: 42, version: getCount === 1 ? 5 : 7 });
      }),
      http.patch(`${BASE_URL}/api/v1/user-stories/42`, async ({ request }) => {
        patchAttempt += 1;
        const body = (await request.json()) as { version: number };
        if (patchAttempt === 1) {
          expect(body.version).toBe(5);
          return HttpResponse.json(
            { version: "The version doesn't match with the current one" },
            { status: 400 },
          );
        }
        expect(body.version).toBe(7);
        return HttpResponse.json({ id: 42, version: 8, subject: "new" });
      }),
    );

    const result = await updateWithVersion(
      makeRequester(),
      "/api/v1/user-stories/42",
      {
        subject: "new",
      },
    );

    expect(result).toEqual({ id: 42, version: 8, subject: "new" });
    expect(getCount).toBe(2);
    expect(patchAttempt).toBe(2);
  });

  it("propagates a second consecutive OCC conflict once the retry is exhausted", async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/user-stories/42`, () =>
        HttpResponse.json({ id: 42, version: 5 }),
      ),
      http.patch(`${BASE_URL}/api/v1/user-stories/42`, () =>
        HttpResponse.json(
          { version: "The version doesn't match with the current one" },
          { status: 400 },
        ),
      ),
    );

    await expect(
      updateWithVersion(makeRequester(), "/api/v1/user-stories/42", {
        subject: "x",
      }),
    ).rejects.toBeInstanceOf(TaigaConflictError);
  });

  it("propagates non-409 errors without retrying", async () => {
    let patchAttempt = 0;
    server.use(
      http.get(`${BASE_URL}/api/v1/user-stories/42`, () =>
        HttpResponse.json({ id: 42, version: 5 }),
      ),
      http.patch(`${BASE_URL}/api/v1/user-stories/42`, () => {
        patchAttempt += 1;
        return HttpResponse.json({ subject: ["invalid"] }, { status: 400 });
      }),
    );

    await expect(
      updateWithVersion(makeRequester(), "/api/v1/user-stories/42", {
        subject: "x",
      }),
    ).rejects.toThrow();
    expect(patchAttempt).toBe(1);
  });
});
