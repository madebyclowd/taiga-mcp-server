import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { BASE_URL, createConnectedTestClient } from "./support.js";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("comment tools", () => {
  it("comment_add PATCHes the resource with a comment field via OCC", async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/epics/9`, () =>
        HttpResponse.json({ id: 9, version: 2 }),
      ),
      http.patch(`${BASE_URL}/api/v1/epics/9`, async ({ request }) => {
        const body = await request.json();
        expect(body).toEqual({ comment: "nice work", version: 2 });
        return HttpResponse.json({ id: 9, version: 3 });
      }),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "comment_add",
      arguments: { resource: "epic", id: 9, comment: "nice work" },
    });

    expect(result.isError).toBeFalsy();
  });

  it("comment_list reads the resource's history endpoint", async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/history/userstory/20`, () =>
        HttpResponse.json([{ comment: "a comment" }, { comment: "" }]),
      ),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "comment_list",
      arguments: { resource: "user_story", id: 20 },
    });

    expect(result.isError).toBeFalsy();
  });
});
