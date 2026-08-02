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

  it("rejects a string body before it ever reaches the network", async () => {
    // The actual, live-verified root cause behind feedback.md's report
    // — a double-encoded JSON string passed as `body` — is now caught
    // here, before any request goes out. See
    // ai-docs/04_audits/taiga-mcp-audit-03-talent-intelligence-field-feedback.md
    // Finding 1's correction.
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "taiga_raw_request",
      arguments: {
        method: "PATCH",
        path: "/api/v1/projects/1",
        body: JSON.stringify({ name: "same name" }),
      },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ text: string }>)[0]?.text ?? "";
    expect(text.toLowerCase()).toContain("string");
  });

  it("appends a malformed-body hint on the exact 'Invalid data' error shape", async () => {
    // Confirmed live: this exact shape is what Taiga returns for a
    // malformed (e.g. double-encoded) body — not a missing OCC
    // `version`, which surfaces as a 409 instead. The zod refine above
    // catches the common case client-side; this is the backstop for
    // any other way the same shape could occur.
    server.use(
      http.patch(`${BASE_URL}/api/v1/projects/1`, () =>
        HttpResponse.json(
          { non_field_errors: ["Invalid data"] },
          { status: 400 },
        ),
      ),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "taiga_raw_request",
      arguments: {
        method: "PATCH",
        path: "/api/v1/projects/1",
        body: { name: "same name" },
      },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ text: string }>)[0]?.text ?? "";
    expect(text.toLowerCase()).toContain("hint");
  });

  it("does not append the hint on an unrelated validation error", async () => {
    server.use(
      http.patch(`${BASE_URL}/api/v1/projects/1`, () =>
        HttpResponse.json(
          { name: ["This field is required."] },
          { status: 400 },
        ),
      ),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "taiga_raw_request",
      arguments: { method: "PATCH", path: "/api/v1/projects/1", body: {} },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ text: string }>)[0]?.text ?? "";
    expect(text.toLowerCase()).not.toContain("hint");
  });

  it("appends the hint for POST too, not just PATCH/PUT — the shape isn't method-specific", async () => {
    server.use(
      http.post(`${BASE_URL}/api/v1/projects`, () =>
        HttpResponse.json(
          { non_field_errors: ["Invalid data"] },
          { status: 400 },
        ),
      ),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "taiga_raw_request",
      arguments: { method: "POST", path: "/api/v1/projects", body: {} },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ text: string }>)[0]?.text ?? "";
    expect(text.toLowerCase()).toContain("hint");
  });
});
