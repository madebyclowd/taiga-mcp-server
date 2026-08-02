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
import {
  BASE_URL,
  createConnectedTestClient,
  createConnectedTestClientWithElicitation,
  type ElicitationScript,
} from "./support.js";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const EPIC = { id: 42, subject: "Fix login bug" };

describe("epic_delete — elicitation-capable client, all 4 outcomes", () => {
  it("accept + confirm: true deletes", async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/epics/42`, () => HttpResponse.json(EPIC)),
      http.delete(
        `${BASE_URL}/api/v1/epics/42`,
        () => new HttpResponse(null, { status: 204 }),
      ),
    );
    const { client } = await createConnectedTestClientWithElicitation(
      (): ElicitationScript => ({
        action: "accept",
        content: { confirm: true },
      }),
    );

    const result = await client.callTool({
      name: "epic_delete",
      arguments: { id: 42 },
    });

    expect(result.isError).toBeFalsy();
  });

  it("decline does not delete and is not an error", async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/epics/42`, () => HttpResponse.json(EPIC)),
    );
    const { client } = await createConnectedTestClientWithElicitation(
      (): ElicitationScript => ({ action: "decline" }),
    );

    const result = await client.callTool({
      name: "epic_delete",
      arguments: { id: 42 },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as { type: string; text: string }[])[0]?.text;
    expect(text).toContain("cancelled");
  });

  it("cancel does not delete and is not an error", async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/epics/42`, () => HttpResponse.json(EPIC)),
    );
    const { client } = await createConnectedTestClientWithElicitation(
      (): ElicitationScript => ({ action: "cancel" }),
    );

    const result = await client.callTool({
      name: "epic_delete",
      arguments: { id: 42 },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as { type: string; text: string }[])[0]?.text;
    expect(text).toContain("cancelled");
  });

  it("timeout (no response) does not delete and is not an error", async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/epics/42`, () => HttpResponse.json(EPIC)),
    );
    const { client } = await createConnectedTestClientWithElicitation(
      (): ElicitationScript => "hang",
    );

    vi.useFakeTimers();
    try {
      const resultPromise = client.callTool(
        { name: "epic_delete", arguments: { id: 42 } },
        undefined,
        { timeout: 400_000 },
      );
      await vi.advanceTimersByTimeAsync(300_000);
      const result = await resultPromise;

      expect(result.isError).toBeFalsy();
      const text = (result.content as { type: string; text: string }[])[0]
        ?.text;
      expect(text).toContain("timed out");
    } finally {
      vi.useRealTimers();
    }
  }, 15_000);
});

describe("epic_delete — fallback client (no elicitation capability)", () => {
  it("first call without confirm returns a preview, does not delete", async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/epics/42`, () => HttpResponse.json(EPIC)),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "epic_delete",
      arguments: { id: 42 },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as { type: string; text: string }[])[0]?.text;
    expect(text).toContain("Fix login bug");
  });

  it("second call with confirm: true deletes", async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/epics/42`, () => HttpResponse.json(EPIC)),
      http.delete(
        `${BASE_URL}/api/v1/epics/42`,
        () => new HttpResponse(null, { status: 204 }),
      ),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "epic_delete",
      arguments: { id: 42, confirm: true },
    });

    expect(result.isError).toBeFalsy();
  });
});

describe("every other delete-capable tool is wired to the gate", () => {
  const cases: {
    tool: string;
    basePath: string;
    args: Record<string, unknown>;
  }[] = [
    { tool: "project_delete", basePath: "/api/v1/projects", args: { id: 1 } },
    {
      tool: "user_story_delete",
      basePath: "/api/v1/userstories",
      args: { id: 1 },
    },
    { tool: "task_delete", basePath: "/api/v1/tasks", args: { id: 1 } },
    { tool: "issue_delete", basePath: "/api/v1/issues", args: { id: 1 } },
    {
      tool: "milestone_delete",
      basePath: "/api/v1/milestones",
      args: { id: 1 },
    },
    { tool: "wiki_page_delete", basePath: "/api/v1/wiki", args: { id: 1 } },
    {
      tool: "membership_delete",
      basePath: "/api/v1/memberships",
      args: { id: 1 },
    },
    {
      tool: "attachment_delete",
      basePath: "/api/v1/epics/attachments",
      args: { id: 1, resource: "epic" },
    },
  ];

  for (const { tool, basePath, args } of cases) {
    it(`${tool} without confirm returns a preview, not a deletion`, async () => {
      server.use(
        http.get(`${BASE_URL}${basePath}/1`, () =>
          HttpResponse.json({ id: 1, subject: "Sample" }),
        ),
      );
      const { client } = await createConnectedTestClient();

      const result = await client.callTool({ name: tool, arguments: args });

      expect(result.isError).toBeFalsy();
      const text = (result.content as { type: string; text: string }[])[0]
        ?.text;
      expect(text).not.toBe("null");
    });
  }
});

describe("requireElicitation: true (server-level opt-in)", () => {
  it("blocks confirm: true from a non-elicitation client — nothing deleted", async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/epics/42`, () => HttpResponse.json(EPIC)),
    );
    const { client } = await createConnectedTestClient({
      requireElicitation: true,
    });

    const result = await client.callTool({
      name: "epic_delete",
      arguments: { id: 42, confirm: true },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as { type: string; text: string }[])[0]?.text;
    expect(text).toContain("requires an elicitation-capable");
  });

  it("still deletes normally for an elicitation-capable client that accepts", async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/epics/42`, () => HttpResponse.json(EPIC)),
      http.delete(
        `${BASE_URL}/api/v1/epics/42`,
        () => new HttpResponse(null, { status: 204 }),
      ),
    );
    const { client } = await createConnectedTestClientWithElicitation(
      (): ElicitationScript => ({
        action: "accept",
        content: { confirm: true },
      }),
      { requireElicitation: true },
    );

    const result = await client.callTool({
      name: "epic_delete",
      arguments: { id: 42 },
    });

    expect(result.isError).toBeFalsy();
  });
});
