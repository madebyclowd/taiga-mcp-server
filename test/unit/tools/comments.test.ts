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

  it("comment_edit POSTs to edit_comment with the comment id as a query param", async () => {
    const commentId = "00000000-0000-0000-0000-000000000001";
    server.use(
      http.post(
        `${BASE_URL}/api/v1/history/userstory/20/edit_comment`,
        async ({ request }) => {
          const url = new URL(request.url);
          expect(url.searchParams.get("id")).toBe(commentId);
          const body = await request.json();
          expect(body).toEqual({ comment: "updated text" });
          return HttpResponse.json({ ok: true });
        },
      ),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "comment_edit",
      arguments: {
        resource: "user_story",
        id: 20,
        comment_id: commentId,
        comment: "updated text",
      },
    });

    expect(result.isError).toBeFalsy();
  });

  it("comment_delete previews first (no confirm), then deletes with confirm: true", async () => {
    const commentId = "00000000-0000-0000-0000-000000000002";
    server.use(
      http.get(`${BASE_URL}/api/v1/history/userstory/20`, () =>
        HttpResponse.json([
          { id: commentId, comment: "a comment to delete" },
          { id: "other-id", comment: "" },
        ]),
      ),
      http.post(
        `${BASE_URL}/api/v1/history/userstory/20/delete_comment`,
        ({ request }) => {
          const url = new URL(request.url);
          expect(url.searchParams.get("id")).toBe(commentId);
          return HttpResponse.json({ ok: true });
        },
      ),
    );
    const { client } = await createConnectedTestClient();

    const preview = await client.callTool({
      name: "comment_delete",
      arguments: { resource: "user_story", id: 20, comment_id: commentId },
    });
    expect(preview.isError).toBeFalsy();
    const previewText = (preview.content as Array<{ text?: string }>)[0]?.text;
    expect(previewText).toContain("a comment to delete");

    const deleted = await client.callTool({
      name: "comment_delete",
      arguments: {
        resource: "user_story",
        id: 20,
        comment_id: commentId,
        confirm: true,
      },
    });
    expect(deleted.isError).toBeFalsy();
  });
});
