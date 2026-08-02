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

describe("batch_create_user_stories", () => {
  it("creates each item independently, one bad item doesn't fail the rest", async () => {
    let call = 0;
    server.use(
      http.post(`${BASE_URL}/api/v1/userstories`, async ({ request }) => {
        call += 1;
        const body = (await request.json()) as { subject: string };
        if (body.subject === "bad") {
          return HttpResponse.json(
            { subject: ["This field is required."] },
            { status: 400 },
          );
        }
        return HttpResponse.json({
          id: call,
          ref: call,
          subject: body.subject,
        });
      }),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "batch_create_user_stories",
      arguments: {
        project: 1,
        items: [{ subject: "good one" }, { subject: "bad" }],
      },
    });

    expect(result.isError).toBeFalsy();
    const parsed = textOf(result) as {
      total: number;
      succeededCount: number;
      failedCount: number;
      succeeded: Array<{ index: number; subject: string }>;
      failed: Array<{ index: number; subject: string }>;
    };
    expect(parsed.total).toBe(2);
    expect(parsed.succeededCount).toBe(1);
    expect(parsed.failedCount).toBe(1);
    expect(parsed.succeeded[0]).toMatchObject({
      index: 0,
      subject: "good one",
    });
    expect(parsed.failed[0]).toMatchObject({ index: 1, subject: "bad" });
  });
});

describe("batch_create_issues", () => {
  it("posts project plus each item's fields", async () => {
    server.use(
      http.post(`${BASE_URL}/api/v1/issues`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        expect(body).toEqual({
          project: 1,
          subject: "Bug A",
          type: 1,
          priority: 2,
          severity: 3,
        });
        return HttpResponse.json({ id: 1, ref: 1, subject: "Bug A" });
      }),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "batch_create_issues",
      arguments: {
        project: 1,
        items: [{ subject: "Bug A", type: 1, priority: 2, severity: 3 }],
      },
    });

    expect(result.isError).toBeFalsy();
    const parsed = textOf(result) as { succeededCount: number };
    expect(parsed.succeededCount).toBe(1);
  });
});

describe("batch_create_tasks", () => {
  it("rejects a batch over the 20-item cap before hitting the network", async () => {
    server.use(
      http.post(`${BASE_URL}/api/v1/tasks`, () => {
        throw new Error("must not reach the network for invalid input");
      }),
    );
    const { client } = await createConnectedTestClient();

    const items = Array.from({ length: 21 }, (_, i) => ({
      user_story: 1,
      subject: `Task ${String(i)}`,
    }));

    const result = await client.callTool({
      name: "batch_create_tasks",
      arguments: { project: 1, items },
    });

    expect(result.isError).toBe(true);
  });
});
