import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { BASE_URL, createConnectedTestClient } from "./support.js";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("membership tools", () => {
  it("registers CRUD plus bulk_create and resend_invitation", async () => {
    const { client } = await createConnectedTestClient();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    for (const verb of ["list", "get", "create", "update", "delete"]) {
      expect(names).toContain(`membership_${verb}`);
    }
    expect(names).toContain("membership_bulk_create");
    expect(names).toContain("membership_resend_invitation");
  });

  it("membership_bulk_create posts the bulk payload with email mapped to username", async () => {
    // Taiga's real endpoint has no `email` field — only `username`
    // (which also accepts an email-shaped string). See
    // ai-docs/04_audits/taiga-mcp-audit-03-talent-intelligence-field-feedback.md
    // Finding 2.
    server.use(
      http.post(
        `${BASE_URL}/api/v1/memberships/bulk_create`,
        async ({ request }) => {
          const body = await request.json();
          expect(body).toEqual({
            project_id: 1,
            bulk_memberships: [{ role_id: 2, username: "a@example.com" }],
          });
          return HttpResponse.json([{ id: 5 }]);
        },
      ),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "membership_bulk_create",
      arguments: {
        project_id: 1,
        bulk_memberships: [{ role_id: 2, email: "a@example.com" }],
      },
    });

    expect(result.isError).toBeFalsy();
  });

  it("membership_bulk_create leaves an explicit username untouched even if email is also set", async () => {
    server.use(
      http.post(
        `${BASE_URL}/api/v1/memberships/bulk_create`,
        async ({ request }) => {
          const body = await request.json();
          expect(body).toEqual({
            project_id: 1,
            bulk_memberships: [{ role_id: 2, username: "explicit-user" }],
          });
          return HttpResponse.json([{ id: 5 }]);
        },
      ),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "membership_bulk_create",
      arguments: {
        project_id: 1,
        bulk_memberships: [
          {
            role_id: 2,
            username: "explicit-user",
            email: "ignored@example.com",
          },
        ],
      },
    });

    expect(result.isError).toBeFalsy();
  });

  it("membership_create maps email to username when username isn't set", async () => {
    server.use(
      http.post(`${BASE_URL}/api/v1/memberships`, async ({ request }) => {
        const body = await request.json();
        expect(body).toEqual({
          project: 1,
          role: 2,
          username: "someone@example.com",
        });
        return HttpResponse.json({ id: 9 });
      }),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "membership_create",
      arguments: { project: 1, role: 2, email: "someone@example.com" },
    });

    expect(result.isError).toBeFalsy();
  });

  it("membership_update with is_admin logs a structured audit line with old/new values", async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/memberships/5`, () =>
        HttpResponse.json({ id: 5, version: 1, is_admin: false }),
      ),
      http.patch(`${BASE_URL}/api/v1/memberships/5`, async ({ request }) => {
        const body = await request.json();
        expect(body).toEqual({ is_admin: true, version: 1 });
        return HttpResponse.json({ id: 5, version: 2, is_admin: true });
      }),
    );
    const { client, taigaClient } = await createConnectedTestClient();
    const logInfo = vi.spyOn(taigaClient.logger, "info");

    const result = await client.callTool({
      name: "membership_update",
      arguments: { id: 5, is_admin: true },
    });

    expect(result.isError).toBeFalsy();
    expect(logInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "membership_is_admin_change",
        membershipId: 5,
        oldValue: false,
        newValue: true,
      }),
      expect.any(String),
    );
  });

  it("membership_update without is_admin does not log an is_admin audit line", async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/memberships/5`, () =>
        HttpResponse.json({ id: 5, version: 1, is_admin: false }),
      ),
      http.patch(`${BASE_URL}/api/v1/memberships/5`, async ({ request }) => {
        const body = await request.json();
        expect(body).toEqual({ role: 3, version: 1 });
        return HttpResponse.json({ id: 5, version: 2, role: 3 });
      }),
    );
    const { client, taigaClient } = await createConnectedTestClient();
    const logInfo = vi.spyOn(taigaClient.logger, "info");

    const result = await client.callTool({
      name: "membership_update",
      arguments: { id: 5, role: 3 },
    });

    expect(result.isError).toBeFalsy();
    expect(logInfo).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: "membership_is_admin_change" }),
      expect.any(String),
    );
  });

  it("membership_resend_invitation posts to the resend action", async () => {
    server.use(
      http.post(
        `${BASE_URL}/api/v1/memberships/5/resend_invitation`,
        () => new HttpResponse("", { status: 200 }),
      ),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "membership_resend_invitation",
      arguments: { id: 5 },
    });

    expect(result.isError).toBeFalsy();
  });
});
