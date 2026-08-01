import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { BASE_URL, createConnectedTestClient } from "./support.js";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("wiki tools", () => {
  it("registers the standard CRUD tools plus wiki_page_get_by_slug", async () => {
    const { client } = await createConnectedTestClient();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    for (const verb of ["list", "get", "create", "update", "delete"]) {
      expect(names).toContain(`wiki_page_${verb}`);
    }
    expect(names).toContain("wiki_page_get_by_slug");
  });

  it("wiki_page_get_by_slug queries project + slug", async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/wiki/by_slug`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("project")).toBe("1");
        expect(url.searchParams.get("slug")).toBe("home");
        return HttpResponse.json({ id: 3, slug: "home" });
      }),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "wiki_page_get_by_slug",
      arguments: { project: 1, slug: "home" },
    });

    expect(result.isError).toBeFalsy();
  });
});
