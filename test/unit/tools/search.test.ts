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

describe("search tool", () => {
  it("queries /api/v1/search with project + text", async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/search`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("project")).toBe("1");
        expect(url.searchParams.get("text")).toBe("login bug");
        return HttpResponse.json({ issues: [{ id: 1 }], count: 1 });
      }),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "search",
      arguments: { project: 1, text: "login bug" },
    });

    expect(result.isError).toBeFalsy();
  });

  it("wraps the grouped-by-type body as { items, pagination }, no real headers involved", async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/search`, () =>
        HttpResponse.json({
          epics: [],
          userstories: [],
          tasks: [],
          wikipages: [],
          issues: [{ id: 1 }],
          count: 1,
        }),
      ),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "search",
      arguments: { project: 1, text: "login bug" },
    });

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toEqual({
      items: {
        epics: [],
        userstories: [],
        tasks: [],
        wikipages: [],
        issues: [{ id: 1 }],
      },
      pagination: { count: 1, current_page: 1, has_next: false },
    });
  });
});
