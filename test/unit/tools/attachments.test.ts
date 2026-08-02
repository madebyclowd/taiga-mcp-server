import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { BASE_URL, createConnectedTestClient } from "./support.js";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("attachment tools", () => {
  it("attachment_upload sends a multipart form with the decoded file", async () => {
    server.use(
      http.post(
        `${BASE_URL}/api/v1/userstories/attachments`,
        async ({ request }) => {
          expect(request.headers.get("content-type")).toMatch(
            /^multipart\/form-data/,
          );
          const form = await request.formData();
          expect(form.get("project")).toBe("1");
          expect(form.get("object_id")).toBe("20");
          const file = form.get("attached_file") as File;
          expect(file.name).toBe("hello.txt");
          expect(await file.text()).toBe("hello world");
          return HttpResponse.json({ id: 99, name: "hello.txt" });
        },
      ),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "attachment_upload",
      arguments: {
        resource: "user_story",
        object_id: 20,
        project: 1,
        file_name: "hello.txt",
        file_base64: Buffer.from("hello world").toString("base64"),
      },
    });

    expect(result.isError).toBeFalsy();
  });

  it("attachment_list filters by object_id", async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/tasks/attachments`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("object_id")).toBe("5");
        return HttpResponse.json([{ id: 1 }]);
      }),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "attachment_list",
      arguments: { resource: "task", object_id: 5 },
    });

    expect(result.isError).toBeFalsy();
  });

  it("attachment_delete removes by id under the resource's attachments path", async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/epics/attachments/1`, () =>
        HttpResponse.json({ id: 1, name: "hello.txt" }),
      ),
      http.delete(
        `${BASE_URL}/api/v1/epics/attachments/1`,
        () => new HttpResponse(null, { status: 204 }),
      ),
    );
    const { client } = await createConnectedTestClient();

    const result = await client.callTool({
      name: "attachment_delete",
      arguments: { resource: "epic", id: 1, confirm: true },
    });

    expect(result.isError).toBeFalsy();
  });
});
