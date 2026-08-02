import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { BASE_URL, createConnectedTestClient } from "./support.js";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function textOf(result: unknown): unknown {
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    throw new Error("expected a content array");
  }
  const first = (content as unknown[])[0] as
    { type?: string; text?: string } | undefined;
  if (!first || first.type !== "text" || typeof first.text !== "string") {
    throw new Error("expected a text content block");
  }
  return JSON.parse(first.text) as unknown;
}

describe("MCP server tool registration", () => {
  it("lists every core CRUD tool plus the resource-specific extras", async () => {
    const { client } = await createConnectedTestClient();
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);

    for (const resource of ["project", "epic", "user_story", "task", "issue"]) {
      for (const verb of ["list", "get", "create", "update", "delete"]) {
        expect(names).toContain(`${resource}_${verb}`);
      }
    }

    expect(names).toEqual(
      expect.arrayContaining([
        "epic_related_user_stories",
        "epic_link_user_story",
        "user_story_assign_milestone",
        "issue_set_classification",
      ]),
    );
  });
});

describe("project tools", () => {
  it("project_list returns the mocked collection", async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/projects`, () =>
        HttpResponse.json([{ id: 1, name: "Demo" }]),
      ),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "project_list",
      arguments: {},
    });

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toEqual([{ id: 1, name: "Demo" }]);
  });

  it("project_create posts the given fields", async () => {
    server.use(
      http.post(`${BASE_URL}/api/v1/projects`, async ({ request }) => {
        const body = await request.json();
        expect(body).toEqual({ name: "New", description: "desc" });
        return HttpResponse.json({ id: 5, name: "New", description: "desc" });
      }),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "project_create",
      arguments: { name: "New", description: "desc" },
    });

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toEqual({ id: 5, name: "New", description: "desc" });
  });

  it("project_update fetches the current version and PATCHes with it (OCC)", async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/projects/5`, () =>
        HttpResponse.json({ id: 5, version: 3, name: "Old" }),
      ),
      http.patch(`${BASE_URL}/api/v1/projects/5`, async ({ request }) => {
        const body = (await request.json()) as {
          version: number;
          name: string;
        };
        expect(body).toEqual({ name: "Updated", version: 3 });
        return HttpResponse.json({ id: 5, version: 4, name: "Updated" });
      }),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "project_update",
      arguments: { id: 5, name: "Updated" },
    });

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toEqual({ id: 5, version: 4, name: "Updated" });
  });

  it("project_delete returns success on 204", async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/projects/5`, () =>
        HttpResponse.json({ id: 5, name: "Sample" }),
      ),
      http.delete(
        `${BASE_URL}/api/v1/projects/5`,
        () => new HttpResponse(null, { status: 204 }),
      ),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "project_delete",
      arguments: { id: 5, confirm: true },
    });

    expect(result.isError).toBeFalsy();
  });

  it("rejects project_create with a missing required field before hitting the network", async () => {
    server.use(
      http.post(`${BASE_URL}/api/v1/projects`, () => {
        throw new Error("must not reach the network for invalid input");
      }),
    );
    const { client } = await createConnectedTestClient();

    // The SDK validates args against the zod inputSchema before our
    // handler runs; a schema failure comes back as isError: true, not
    // a rejected callTool() promise.
    const result = await client.callTool({
      name: "project_create",
      arguments: { name: "Only Name" },
    });

    expect(result.isError).toBe(true);
  });

  it("surfaces a structured, non-flattened error when Taiga returns 400", async () => {
    server.use(
      http.post(`${BASE_URL}/api/v1/projects`, () =>
        HttpResponse.json(
          {
            name: ["This field is required."],
            _error_message: "Validation failed",
          },
          { status: 400 },
        ),
      ),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "project_create",
      arguments: { name: "x", description: "y" },
    });

    expect(result.isError).toBe(true);
    const structured = textOf(result) as {
      status: number;
      fields: { field: string; messages: string[] }[];
      tool: string;
    };
    expect(structured.status).toBe(400);
    expect(structured.tool).toBe("project_create");
    expect(structured.fields).toEqual([
      { field: "name", messages: ["This field is required."] },
    ]);
  });
});

describe("epic extra tools", () => {
  it("epic_related_user_stories lists linked stories", async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/epics/9/related_userstories`, () =>
        HttpResponse.json([{ id: 20, subject: "Linked story" }]),
      ),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "epic_related_user_stories",
      arguments: { id: 9 },
    });

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toEqual([{ id: 20, subject: "Linked story" }]);
  });

  it("epic_link_user_story posts both epic and user_story ids", async () => {
    // Taiga requires `epic` in the body too, even though it's already in
    // the URL path — confirmed live during phase 5 integration testing
    // (a 400 "This field is required." without it).
    server.use(
      http.post(
        `${BASE_URL}/api/v1/epics/9/related_userstories`,
        async ({ request }) => {
          const body = await request.json();
          expect(body).toEqual({ epic: 9, user_story: 20 });
          return HttpResponse.json({ epic: 9, user_story: 20 });
        },
      ),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "epic_link_user_story",
      arguments: { id: 9, user_story: 20 },
    });

    expect(result.isError).toBeFalsy();
  });
});

describe("user_story_assign_milestone", () => {
  it("PATCHes only the milestone field via OCC", async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/userstories/20`, () =>
        HttpResponse.json({ id: 20, version: 1 }),
      ),
      http.patch(`${BASE_URL}/api/v1/userstories/20`, async ({ request }) => {
        const body = (await request.json()) as {
          version: number;
          milestone: number;
        };
        expect(body).toEqual({ milestone: 7, version: 1 });
        return HttpResponse.json({ id: 20, version: 2, milestone: 7 });
      }),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "user_story_assign_milestone",
      arguments: { id: 20, milestone: 7 },
    });

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toEqual({ id: 20, version: 2, milestone: 7 });
  });
});

describe("issue_set_classification", () => {
  it("PATCHes only the provided classification fields via OCC", async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/issues/30`, () =>
        HttpResponse.json({ id: 30, version: 2 }),
      ),
      http.patch(`${BASE_URL}/api/v1/issues/30`, async ({ request }) => {
        const body = (await request.json()) as {
          version: number;
          priority: number;
          severity: number;
        };
        expect(body).toEqual({ priority: 3, severity: 2, version: 2 });
        return HttpResponse.json({
          id: 30,
          version: 3,
          priority: 3,
          severity: 2,
        });
      }),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "issue_set_classification",
      arguments: { id: 30, priority: 3, severity: 2 },
    });

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toEqual({
      id: 30,
      version: 3,
      priority: 3,
      severity: 2,
    });
  });
});
