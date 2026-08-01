import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import pino from "pino";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { TaigaClient } from "../../../src/client/taiga-client.js";

const BASE_URL = "https://taiga.example.test";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("TaigaClient", () => {
  it("routes get/create/delete/updateWithVersion/request through one authenticated client", async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/projects/1`, ({ request }) => {
        expect(request.headers.get("authorization")).toBe(
          "Bearer preset-token",
        );
        return HttpResponse.json({ id: 1, version: 1 });
      }),
      http.post(`${BASE_URL}/api/v1/projects`, () =>
        HttpResponse.json({ id: 2 }),
      ),
      http.delete(
        `${BASE_URL}/api/v1/projects/2`,
        () => new HttpResponse(null, { status: 204 }),
      ),
      http.patch(`${BASE_URL}/api/v1/projects/1`, async ({ request }) => {
        const body = (await request.json()) as { version: number };
        expect(body.version).toBe(1);
        return HttpResponse.json({ id: 1, version: 2 });
      }),
      http.get(`${BASE_URL}/api/v1/user-storage`, () =>
        HttpResponse.json([{ key: "x" }]),
      ),
    );

    const client = new TaigaClient({
      baseUrl: BASE_URL,
      credentials: { kind: "token", token: "preset-token" },
      logger: pino({ level: "silent" }),
    });

    await expect(client.get("/api/v1/projects/1")).resolves.toEqual({
      id: 1,
      version: 1,
    });
    await expect(
      client.create("/api/v1/projects", { name: "x" }),
    ).resolves.toEqual({
      id: 2,
    });
    await expect(client.delete("/api/v1/projects/2")).resolves.toBeUndefined();
    await expect(
      client.updateWithVersion("/api/v1/projects/1", { name: "y" }),
    ).resolves.toEqual({ id: 1, version: 2 });
    await expect(
      client.request({ method: "GET", path: "/api/v1/user-storage" }),
    ).resolves.toEqual([{ key: "x" }]);
  });

  it("defaults to a working stderr-bound logger when none is supplied", () => {
    const client = new TaigaClient({
      baseUrl: BASE_URL,
      credentials: { kind: "token", token: "t" },
    });
    expect(client.logger).toBeDefined();
    expect(typeof client.logger.info).toBe("function");
  });
});
