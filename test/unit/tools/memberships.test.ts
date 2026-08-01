import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
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

  it("membership_bulk_create posts the bulk payload", async () => {
    server.use(
      http.post(
        `${BASE_URL}/api/v1/memberships/bulk_create`,
        async ({ request }) => {
          const body = await request.json();
          expect(body).toEqual({
            project_id: 1,
            bulk_memberships: [{ role_id: 2, email: "a@example.com" }],
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
