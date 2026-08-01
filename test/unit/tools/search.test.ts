import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { BASE_URL, createConnectedTestClient } from "./support.js";

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
});
