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

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("*_filters_data tools", () => {
  it("user_story_filters_data passes project through to /userstories/filters_data", async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/userstories/filters_data`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("project")).toBe("1");
        return HttpResponse.json({
          statuses: [{ id: 1, name: "New", count: 0 }],
        });
      }),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "user_story_filters_data",
      arguments: { project: 1 },
    });

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toEqual({
      statuses: [{ id: 1, name: "New", count: 0 }],
    });
  });

  it("task_filters_data passes project through to /tasks/filters_data", async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/tasks/filters_data`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("project")).toBe("2");
        return HttpResponse.json({ statuses: [] });
      }),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "task_filters_data",
      arguments: { project: 2 },
    });

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toEqual({ statuses: [] });
  });

  it("issue_filters_data passes project through to /issues/filters_data", async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/issues/filters_data`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("project")).toBe("3");
        return HttpResponse.json({ types: [], statuses: [] });
      }),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "issue_filters_data",
      arguments: { project: 3 },
    });

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toEqual({ types: [], statuses: [] });
  });
});
