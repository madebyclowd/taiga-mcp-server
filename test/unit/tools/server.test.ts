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
        "epic_unlink_user_story",
        "user_story_assign_milestone",
        "issue_set_classification",
        "ref_resolve",
        "comment_edit",
        "comment_delete",
        "attachment_download",
        "batch_create_issues",
        "batch_create_user_stories",
        "batch_create_tasks",
        "user_story_filters_data",
        "task_filters_data",
        "issue_filters_data",
      ]),
    );
  });

  it("annotates tools per verb (spot-check across resource-crud and a hand-wired tool)", async () => {
    const { client } = await createConnectedTestClient();
    const { tools } = await client.listTools();
    const byName = new Map(tools.map((tool) => [tool.name, tool]));

    expect(byName.get("project_list")?.annotations).toMatchObject({
      readOnlyHint: true,
      openWorldHint: true,
    });
    expect(byName.get("project_delete")?.annotations).toMatchObject({
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    });
    expect(byName.get("project_create")?.annotations).toMatchObject({
      destructiveHint: false,
      idempotentHint: false,
    });
    expect(byName.get("project_update")?.annotations).toMatchObject({
      idempotentHint: true,
    });
    expect(byName.get("epic_related_user_stories")?.annotations).toMatchObject({
      readOnlyHint: true,
      openWorldHint: true,
    });
    expect(byName.get("project_list")?.title).toBe("List Projects");
    expect(byName.get("epic_get")?.title).toBe("Get Epic");
  });
});

describe("project tools", () => {
  it("project_list returns the mocked collection", async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/projects`, () =>
        HttpResponse.json([{ id: 1, name: "Demo" }], {
          headers: {
            "x-pagination-count": "1",
            "x-pagination-current": "1",
            "x-paginated": "true",
          },
        }),
      ),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "project_list",
      arguments: {},
    });

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toEqual({
      items: [{ id: 1, name: "Demo" }],
      pagination: { count: 1, current_page: 1, has_next: false },
    });
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

  it("project_update accepts module-toggle fields (e.g. is_epics_activated)", async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/projects/5`, () =>
        HttpResponse.json({ id: 5, version: 3, is_epics_activated: false }),
      ),
      http.patch(`${BASE_URL}/api/v1/projects/5`, async ({ request }) => {
        const body = await request.json();
        expect(body).toEqual({ is_epics_activated: true, version: 3 });
        return HttpResponse.json({
          id: 5,
          version: 4,
          is_epics_activated: true,
        });
      }),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "project_update",
      arguments: { id: 5, is_epics_activated: true },
    });

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toEqual({
      id: 5,
      version: 4,
      is_epics_activated: true,
    });
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

describe("verbosity (end-to-end through resource-crud.ts)", () => {
  const wideProject = {
    id: 5,
    name: "Demo",
    owner_extra_info: { full_name: "Alice" },
    description_html: "<p>x</p>",
  };

  it("project_get with verbosity: standard drops *_extra_info/*_html fields", async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/projects/5`, () =>
        HttpResponse.json(wideProject),
      ),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "project_get",
      arguments: { id: 5, verbosity: "standard" },
    });

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toEqual({ id: 5, name: "Demo" });
  });

  it("project_get with no verbosity (default full) returns every field", async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/projects/5`, () =>
        HttpResponse.json(wideProject),
      ),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "project_get",
      arguments: { id: 5 },
    });

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toEqual(wideProject);
  });

  it("project_list with verbosity: minimal trims every item in { items, pagination }", async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/projects`, () =>
        HttpResponse.json([wideProject], {
          headers: { "x-pagination-count": "1", "x-pagination-current": "1" },
        }),
      ),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "project_list",
      arguments: { verbosity: "minimal" },
    });

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toEqual({
      items: [{ id: 5 }],
      pagination: { count: 1, current_page: 1, has_next: false },
    });
  });
});

describe("epic extra tools", () => {
  it("epic_create's description flags the module-visibility sharp edge", async () => {
    const { client } = await createConnectedTestClient();
    const { tools } = await client.listTools();
    const epicCreate = tools.find((t) => t.name === "epic_create");
    expect(epicCreate?.description).toContain("is_epics_activated");
  });

  it("epic_related_user_stories lists linked stories", async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/epics/9/related_userstories`, () =>
        HttpResponse.json([{ id: 20, subject: "Linked story" }], {
          headers: {
            "x-pagination-count": "1",
            "x-pagination-current": "1",
            "x-paginated": "true",
          },
        }),
      ),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "epic_related_user_stories",
      arguments: { id: 9 },
    });

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toEqual({
      items: [{ id: 20, subject: "Linked story" }],
      pagination: { count: 1, current_page: 1, has_next: false },
    });
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

  it("epic_unlink_user_story DELETEs the related_userstories sub-resource, no body, no gate", async () => {
    server.use(
      http.delete(
        `${BASE_URL}/api/v1/epics/9/related_userstories/20`,
        () => new HttpResponse(null, { status: 204 }),
      ),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "epic_unlink_user_story",
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
