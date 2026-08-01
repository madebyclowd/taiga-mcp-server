import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { BASE_URL, createConnectedTestClient } from "./support.js";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("milestone tools", () => {
  it("registers the standard CRUD tools plus milestone_stats", async () => {
    const { client } = await createConnectedTestClient();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    for (const verb of ["list", "get", "create", "update", "delete"]) {
      expect(names).toContain(`milestone_${verb}`);
    }
    expect(names).toContain("milestone_stats");
  });

  it("milestone_create posts the given fields", async () => {
    server.use(
      http.post(`${BASE_URL}/api/v1/milestones`, async ({ request }) => {
        const body = await request.json();
        expect(body).toEqual({
          project: 1,
          name: "Sprint 1",
          estimated_start: "2026-01-01",
          estimated_finish: "2026-01-15",
        });
        return HttpResponse.json({ id: 7, name: "Sprint 1" });
      }),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "milestone_create",
      arguments: {
        project: 1,
        name: "Sprint 1",
        estimated_start: "2026-01-01",
        estimated_finish: "2026-01-15",
      },
    });

    expect(result.isError).toBeFalsy();
  });

  it("milestone_stats fetches the burndown stats", async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/milestones/7/stats`, () =>
        HttpResponse.json({ total_points: 10, completed_points: 4 }),
      ),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "milestone_stats",
      arguments: { id: 7 },
    });

    expect(result.isError).toBeFalsy();
  });
});
