import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { BASE_URL, createConnectedTestClient } from "./support.js";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("taiga_raw_request escape hatch", () => {
  it("routes an allow-listed method/path through TaigaClient", async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/webhooks`, () =>
        HttpResponse.json([{ id: 1 }]),
      ),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "taiga_raw_request",
      arguments: { method: "GET", path: "/api/v1/webhooks" },
    });

    expect(result.isError).toBeFalsy();
  });

  it("rejects a path outside /api/v1/ before hitting the network", async () => {
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "taiga_raw_request",
      arguments: { method: "GET", path: "/admin/secrets" },
    });

    expect(result.isError).toBe(true);
  });

  it("rejects an absolute URL disguised as a path", async () => {
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "taiga_raw_request",
      arguments: {
        method: "GET",
        path: "https://evil.example/api/v1/x",
      },
    });

    expect(result.isError).toBe(true);
  });

  it("rejects path traversal segments", async () => {
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "taiga_raw_request",
      arguments: { method: "GET", path: "/api/v1/../admin" },
    });

    expect(result.isError).toBe(true);
  });

  it("rejects a disallowed HTTP method", async () => {
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "taiga_raw_request",
      arguments: { method: "HEAD", path: "/api/v1/webhooks" },
    });

    expect(result.isError).toBe(true);
  });
});
