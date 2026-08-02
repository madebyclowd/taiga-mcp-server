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

describe("ref_resolve", () => {
  it("resolves a numeric project by fetching its slug first, then calls the resolver", async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/projects/1`, () =>
        HttpResponse.json({ id: 1, slug: "demo-project" }),
      ),
      http.get(`${BASE_URL}/api/v1/resolver`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("project")).toBe("demo-project");
        expect(url.searchParams.get("ref")).toBe("436");
        return HttpResponse.json({ project: 1, us: 55 });
      }),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "ref_resolve",
      arguments: { project: 1, ref: 436 },
    });

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toEqual({ type: "user_story", id: 55, project: 1 });
  });

  it("strips a leading # and accepts a string project (slug) directly, no extra GET", async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/resolver`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("project")).toBe("demo-project");
        expect(url.searchParams.get("ref")).toBe("436");
        return HttpResponse.json({ project: 1, issue: 9 });
      }),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "ref_resolve",
      arguments: { project: "demo-project", ref: "#436" },
    });

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toEqual({ type: "issue", id: 9, project: 1 });
  });

  it("resolves epic refs too", async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/resolver`, () =>
        HttpResponse.json({ project: 1, epic: 3 }),
      ),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "ref_resolve",
      arguments: { project: "demo-project", ref: 3 },
    });

    expect(textOf(result)).toEqual({ type: "epic", id: 3, project: 1 });
  });

  it("errors clearly when the ref doesn't match anything in the project", async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/resolver`, () =>
        // Confirmed live: a non-matching ref is still a 200 with just
        // { project } — no us/task/issue/epic key present.
        HttpResponse.json({ project: 1 }),
      ),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "ref_resolve",
      arguments: { project: "demo-project", ref: 999 },
    });

    expect(result.isError).toBe(true);
  });
});
