import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { BASE_URL, createConnectedTestClient } from "./support.js";

function textOf(result: unknown): unknown {
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) throw new Error("expected a content array");
  const first = (content as unknown[])[0] as
    { type?: string; text?: string } | undefined;
  if (!first || first.type !== "text" || typeof first.text !== "string") {
    throw new Error("expected a text content block");
  }
  return JSON.parse(first.text) as unknown;
}

const members = [
  { user: 1, full_name: "Alice A", email: "alice@example.com" },
  { user: 2, full_name: "Bob B", email: "bob@example.com" },
];

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("name-based assignee/watcher resolution wiring", () => {
  it("epic_create: project is already in args, resolves assigned_to and watchers in one membership fetch", async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/memberships`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("project")).toBe("1");
        return HttpResponse.json(members);
      }),
      http.post(`${BASE_URL}/api/v1/epics`, async ({ request }) => {
        const body = await request.json();
        expect(body).toEqual({
          project: 1,
          subject: "New epic",
          assigned_to: 1,
          watchers: [1, 2],
        });
        return HttpResponse.json({ id: 9, subject: "New epic" });
      }),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "epic_create",
      arguments: {
        project: 1,
        subject: "New epic",
        assigned_to: "alice@example.com",
        watchers: ["alice@example.com", "Bob B"],
      },
    });

    expect(result.isError).toBeFalsy();
  });

  it("user_story_update: project isn't in args, fetches the story first to find it", async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/userstories/20`, () =>
        HttpResponse.json({ id: 20, project: 1, version: 3 }),
      ),
      http.get(`${BASE_URL}/api/v1/memberships`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("project")).toBe("1");
        return HttpResponse.json(members);
      }),
      http.patch(`${BASE_URL}/api/v1/userstories/20`, async ({ request }) => {
        const body = await request.json();
        expect(body).toEqual({ assigned_to: 2, version: 3 });
        return HttpResponse.json({ id: 20, assigned_to: 2, version: 4 });
      }),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "user_story_update",
      arguments: { id: 20, assigned_to: "Bob B" },
    });

    expect(result.isError).toBeFalsy();
  });

  it("numeric assigned_to skips member resolution entirely — no membership fetch", async () => {
    server.use(
      // No /memberships handler registered — a call would fail the test
      // via onUnhandledRequest: "error".
      http.post(`${BASE_URL}/api/v1/tasks`, async ({ request }) => {
        const body = await request.json();
        expect(body).toEqual({
          project: 1,
          user_story: 20,
          subject: "A task",
          assigned_to: 2,
        });
        return HttpResponse.json({ id: 5, subject: "A task" });
      }),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "task_create",
      arguments: {
        project: 1,
        user_story: 20,
        subject: "A task",
        assigned_to: 2,
      },
    });

    expect(result.isError).toBeFalsy();
  });

  it("null assigned_to (explicit unassign) skips member resolution entirely", async () => {
    server.use(
      http.post(`${BASE_URL}/api/v1/issues`, async ({ request }) => {
        const body = await request.json();
        expect(body).toMatchObject({ assigned_to: null });
        return HttpResponse.json({ id: 5, subject: "An issue" });
      }),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "issue_create",
      arguments: {
        project: 1,
        subject: "An issue",
        type: 1,
        priority: 1,
        severity: 1,
        assigned_to: null,
      },
    });

    expect(result.isError).toBeFalsy();
  });

  it("surfaces a structured ambiguous_match error, not a flattened message", async () => {
    const dupMembers = [
      ...members,
      { user: 3, full_name: "Alice A", email: "a2@example.com" },
    ];
    server.use(
      http.get(`${BASE_URL}/api/v1/memberships`, () =>
        HttpResponse.json(dupMembers),
      ),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "epic_create",
      arguments: { project: 1, subject: "x", assigned_to: "Alice A" },
    });

    expect(result.isError).toBe(true);
    const structured = textOf(result) as { error: string; identifier: string };
    expect(structured.error).toBe("ambiguous_match");
    expect(structured.identifier).toBe("Alice A");
  });
});
