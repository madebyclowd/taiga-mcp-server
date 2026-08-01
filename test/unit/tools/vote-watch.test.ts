import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { BASE_URL, createConnectedTestClient } from "./support.js";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("vote/watch tools", () => {
  it("vote_add posts to the upvote action and handles an empty 200 body", async () => {
    server.use(
      http.post(
        `${BASE_URL}/api/v1/issues/30/upvote`,
        () => new HttpResponse("", { status: 200 }),
      ),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "vote_add",
      arguments: { resource: "issue", id: 30 },
    });

    expect(result.isError).toBeFalsy();
  });

  it("vote_remove posts to the downvote action", async () => {
    server.use(
      http.post(
        `${BASE_URL}/api/v1/issues/30/downvote`,
        () => new HttpResponse("", { status: 200 }),
      ),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "vote_remove",
      arguments: { resource: "issue", id: 30 },
    });

    expect(result.isError).toBeFalsy();
  });

  it("watch_add posts to the watch action for a milestone", async () => {
    server.use(
      http.post(
        `${BASE_URL}/api/v1/milestones/7/watch`,
        () => new HttpResponse("", { status: 200 }),
      ),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "watch_add",
      arguments: { resource: "milestone", id: 7 },
    });

    expect(result.isError).toBeFalsy();
  });

  it("watch_remove posts to the unwatch action", async () => {
    server.use(
      http.post(
        `${BASE_URL}/api/v1/wiki/3/unwatch`,
        () => new HttpResponse("", { status: 200 }),
      ),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "watch_remove",
      arguments: { resource: "wiki_page", id: 3 },
    });

    expect(result.isError).toBeFalsy();
  });

  it("rejects vote_add for a resource that doesn't support voting", async () => {
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "vote_add",
      arguments: { resource: "milestone", id: 7 },
    });

    expect(result.isError).toBe(true);
  });
});
