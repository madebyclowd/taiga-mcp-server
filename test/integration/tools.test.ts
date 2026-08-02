import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import pino from "pino";
import { TaigaClient } from "../../src/client/taiga-client.js";
import { createServer } from "../../src/server.js";
import {
  getIntegrationConfig,
  shouldRunIntegrationTests,
  TestFixtureTracker,
} from "./setup.js";

const config = getIntegrationConfig();
const runIntegration = shouldRunIntegrationTests();

interface ToolResponse {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

interface TaigaEntity {
  id: number;
  slug?: string;
  subject?: string;
  username?: string;
  version?: number;
}

function jsonOf(response: ToolResponse): TaigaEntity {
  return JSON.parse(response.content[0]?.text ?? "{}") as TaigaEntity;
}

describe.runIf(runIntegration)("Integration: MCP Tools E2E", () => {
  let mcpClient: Client;
  let taigaClient: TaigaClient;
  const tracker = new TestFixtureTracker();
  let projectId: number;
  let currentUserId: number;
  let currentUserEmail: string;

  beforeAll(async () => {
    if (!config) return;

    taigaClient = new TaigaClient({
      baseUrl: config.baseUrl,
      credentials: config.token
        ? { kind: "token", token: config.token }
        : {
            kind: "password",
            username: config.username!,
            password: config.password!,
          },
      logger: pino({ level: "silent" }),
    });

    const server = createServer(taigaClient);
    const [serverTransport, clientTransport] =
      InMemoryTransport.createLinkedPair();

    mcpClient = new Client({
      name: "integration-test-client",
      version: "0.1.0",
    });

    await Promise.all([
      server.connect(serverTransport),
      mcpClient.connect(clientTransport),
    ]);

    const project = await taigaClient.get<{ id: number }>(
      `/api/v1/projects/by_slug?slug=${config.projectSlug}`,
    );
    projectId = project.id;

    const me = await taigaClient.get<{ id: number; email: string }>(
      "/api/v1/users/me",
    );
    currentUserId = me.id;
    currentUserEmail = me.email;
  });

  afterAll(async () => {
    if (taigaClient) {
      await tracker.teardown(taigaClient);
    }
  });

  it("should list projects via project_list and find the test project", async () => {
    // Unfiltered project_list is a cross-instance discovery listing, not
    // "my projects" — confirmed live (the dummy project wasn't in the
    // first page of unfiltered results). Scope by member id, matching
    // how a real caller would actually find their own projects.
    const response = (await mcpClient.callTool({
      name: "project_list",
      arguments: { member: currentUserId },
    })) as ToolResponse;

    expect(response.content).toBeDefined();
    const text = response.content[0]?.text ?? "";
    expect(text).toContain(config?.projectSlug);
  });

  it("should get project details via project_get", async () => {
    const response = (await mcpClient.callTool({
      name: "project_get",
      arguments: { id: projectId },
    })) as ToolResponse;

    const project = jsonOf(response);
    expect(project.id).toBe(projectId);
    expect(project.slug).toBe(config?.projectSlug);
  });

  it("should create, get, update, and delete a user story via tools", async () => {
    const subject = `E2E Tool Story ${Date.now()}`;
    const createRes = (await mcpClient.callTool({
      name: "user_story_create",
      arguments: { project: projectId, subject },
    })) as ToolResponse;

    const story = jsonOf(createRes);
    tracker.track("userstories", story.id);
    expect(story.id).toBeGreaterThan(0);

    const getRes = (await mcpClient.callTool({
      name: "user_story_get",
      arguments: { id: story.id },
    })) as ToolResponse;
    expect(jsonOf(getRes).id).toBe(story.id);

    const updateRes = (await mcpClient.callTool({
      name: "user_story_update",
      arguments: { id: story.id, subject: `${subject} - Updated` },
    })) as ToolResponse;
    expect(jsonOf(updateRes).subject).toContain("Updated");

    const deleteRes = (await mcpClient.callTool({
      name: "user_story_delete",
      arguments: { id: story.id },
    })) as ToolResponse;
    expect(deleteRes.isError).toBeFalsy();
  });

  it("should create and get an epic via tools, then link/list a related user story", async () => {
    const epicSubject = `E2E Tool Epic ${Date.now()}`;
    const createEpicRes = (await mcpClient.callTool({
      name: "epic_create",
      arguments: { project: projectId, subject: epicSubject },
    })) as ToolResponse;

    const epic = jsonOf(createEpicRes);
    tracker.track("epics", epic.id);
    expect(epic.id).toBeGreaterThan(0);

    const getEpicRes = (await mcpClient.callTool({
      name: "epic_get",
      arguments: { id: epic.id },
    })) as ToolResponse;
    expect(jsonOf(getEpicRes).id).toBe(epic.id);

    const storySubject = `E2E Epic-Linked Story ${Date.now()}`;
    const createStoryRes = (await mcpClient.callTool({
      name: "user_story_create",
      arguments: { project: projectId, subject: storySubject },
    })) as ToolResponse;
    const story = jsonOf(createStoryRes);
    tracker.track("userstories", story.id);

    const linkRes = (await mcpClient.callTool({
      name: "epic_link_user_story",
      arguments: { id: epic.id, user_story: story.id },
    })) as ToolResponse;
    expect(linkRes.isError).toBeFalsy();

    const relatedRes = (await mcpClient.callTool({
      name: "epic_related_user_stories",
      arguments: { id: epic.id },
    })) as ToolResponse;
    const relatedText = relatedRes.content[0]?.text ?? "";
    expect(relatedText).toContain(String(story.id));
  });

  it("should create and get an issue via tools", async () => {
    const project = await taigaClient.get<{
      issue_types: Array<{ id: number }>;
      issue_statuses: Array<{ id: number }>;
      priorities: Array<{ id: number }>;
      severities: Array<{ id: number }>;
    }>(`/api/v1/projects/${projectId}`);

    const typeId = project.issue_types[0]?.id;
    const statusId = project.issue_statuses[0]?.id;
    const priorityId = project.priorities[0]?.id;
    const severityId = project.severities[0]?.id;

    if (!typeId || !statusId || !priorityId || !severityId) {
      return;
    }

    const subject = `E2E Tool Issue ${Date.now()}`;
    const createRes = (await mcpClient.callTool({
      name: "issue_create",
      arguments: {
        project: projectId,
        subject,
        type: typeId,
        status: statusId,
        priority: priorityId,
        severity: severityId,
      },
    })) as ToolResponse;

    const issue = jsonOf(createRes);
    tracker.track("issues", issue.id);
    expect(issue.id).toBeGreaterThan(0);

    const getRes = (await mcpClient.callTool({
      name: "issue_get",
      arguments: { id: issue.id },
    })) as ToolResponse;
    expect(jsonOf(getRes).id).toBe(issue.id);

    const classifyRes = (await mcpClient.callTool({
      name: "issue_set_classification",
      arguments: { id: issue.id, priority: priorityId },
    })) as ToolResponse;
    expect(classifyRes.isError).toBeFalsy();
  });

  it("should create a task under a user story via tools", async () => {
    const storySubject = `E2E Task Parent Story ${Date.now()}`;
    const createStoryRes = (await mcpClient.callTool({
      name: "user_story_create",
      arguments: { project: projectId, subject: storySubject },
    })) as ToolResponse;
    const story = jsonOf(createStoryRes);
    tracker.track("userstories", story.id);

    const taskSubject = `E2E Tool Task ${Date.now()}`;
    const createTaskRes = (await mcpClient.callTool({
      name: "task_create",
      arguments: {
        project: projectId,
        user_story: story.id,
        subject: taskSubject,
      },
    })) as ToolResponse;
    const task = jsonOf(createTaskRes);
    tracker.track("tasks", task.id);
    expect(task.id).toBeGreaterThan(0);

    const getRes = (await mcpClient.callTool({
      name: "task_get",
      arguments: { id: task.id },
    })) as ToolResponse;
    expect(jsonOf(getRes).id).toBe(task.id);
  });

  it("should create, list, and delete a milestone (sprint) via tools", async () => {
    const today = new Date();
    const inTwoWeeks = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
    const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

    const createRes = (await mcpClient.callTool({
      name: "milestone_create",
      arguments: {
        project: projectId,
        name: `E2E Sprint ${Date.now()}`,
        estimated_start: isoDate(today),
        estimated_finish: isoDate(inTwoWeeks),
      },
    })) as ToolResponse;
    const milestone = jsonOf(createRes);
    tracker.track("milestones", milestone.id);
    expect(milestone.id).toBeGreaterThan(0);

    const listRes = (await mcpClient.callTool({
      name: "milestone_list",
      arguments: { project: projectId },
    })) as ToolResponse;
    expect(listRes.content[0]?.text ?? "").toContain(String(milestone.id));
  });

  it("should create, get by slug, and update a wiki page via tools", async () => {
    const slug = `e2e-wiki-page-${Date.now()}`;
    const createRes = (await mcpClient.callTool({
      name: "wiki_page_create",
      arguments: { project: projectId, slug, content: "Initial content" },
    })) as ToolResponse;
    const page = jsonOf(createRes);
    tracker.track("wiki", page.id);
    expect(page.id).toBeGreaterThan(0);

    const bySlugRes = (await mcpClient.callTool({
      name: "wiki_page_get_by_slug",
      arguments: { project: projectId, slug },
    })) as ToolResponse;
    expect(jsonOf(bySlugRes).id).toBe(page.id);

    const updateRes = (await mcpClient.callTool({
      name: "wiki_page_update",
      arguments: { id: page.id, content: "Updated content" },
    })) as ToolResponse;
    expect(updateRes.isError).toBeFalsy();
  });

  it("should add and list comments on a user story via tools", async () => {
    const createStoryRes = (await mcpClient.callTool({
      name: "user_story_create",
      arguments: {
        project: projectId,
        subject: `E2E Comment Story ${Date.now()}`,
      },
    })) as ToolResponse;
    const story = jsonOf(createStoryRes);
    tracker.track("userstories", story.id);

    const commentText = `Integration test comment ${Date.now()}`;
    const addRes = (await mcpClient.callTool({
      name: "comment_add",
      arguments: { resource: "user_story", id: story.id, comment: commentText },
    })) as ToolResponse;
    expect(addRes.isError).toBeFalsy();

    const listRes = (await mcpClient.callTool({
      name: "comment_list",
      arguments: { resource: "user_story", id: story.id },
    })) as ToolResponse;
    expect(listRes.content[0]?.text ?? "").toContain(commentText);
  });

  it("should vote and watch a user story via tools", async () => {
    const createStoryRes = (await mcpClient.callTool({
      name: "user_story_create",
      arguments: {
        project: projectId,
        subject: `E2E Vote/Watch Story ${Date.now()}`,
      },
    })) as ToolResponse;
    const story = jsonOf(createStoryRes);
    tracker.track("userstories", story.id);

    const voteRes = (await mcpClient.callTool({
      name: "vote_add",
      arguments: { resource: "user_story", id: story.id },
    })) as ToolResponse;
    expect(voteRes.isError).toBeFalsy();

    const unvoteRes = (await mcpClient.callTool({
      name: "vote_remove",
      arguments: { resource: "user_story", id: story.id },
    })) as ToolResponse;
    expect(unvoteRes.isError).toBeFalsy();

    const watchRes = (await mcpClient.callTool({
      name: "watch_add",
      arguments: { resource: "user_story", id: story.id },
    })) as ToolResponse;
    expect(watchRes.isError).toBeFalsy();

    const unwatchRes = (await mcpClient.callTool({
      name: "watch_remove",
      arguments: { resource: "user_story", id: story.id },
    })) as ToolResponse;
    expect(unwatchRes.isError).toBeFalsy();
  });

  it("should find a fixture via the search tool", async () => {
    const uniqueSubject = `E2E Searchable Story ${Date.now()}`;
    const createRes = (await mcpClient.callTool({
      name: "user_story_create",
      arguments: { project: projectId, subject: uniqueSubject },
    })) as ToolResponse;
    const story = jsonOf(createRes);
    tracker.track("userstories", story.id);

    const searchRes = (await mcpClient.callTool({
      name: "search",
      arguments: { project: projectId, text: uniqueSubject },
    })) as ToolResponse;
    expect(searchRes.content[0]?.text ?? "").toContain(String(story.id));
  });

  it("should execute a raw request via the taiga_raw_request escape hatch", async () => {
    const response = (await mcpClient.callTool({
      name: "taiga_raw_request",
      arguments: {
        method: "GET",
        path: "/api/v1/users/me",
      },
    })) as ToolResponse;

    expect(response.content).toBeDefined();
    const me = jsonOf(response);
    expect(me.id).toBeGreaterThan(0);
  });

  it("should resolve a ref to its type and id via ref_resolve", async () => {
    const createRes = (await mcpClient.callTool({
      name: "user_story_create",
      arguments: { project: projectId, subject: `E2E Ref Story ${Date.now()}` },
    })) as ToolResponse;
    const story = jsonOf(createRes) as { id: number; ref?: number };
    tracker.track("userstories", story.id);

    const resolveRes = (await mcpClient.callTool({
      name: "ref_resolve",
      arguments: { project: config?.projectSlug, ref: story.ref },
    })) as ToolResponse;

    expect(resolveRes.isError).toBeFalsy();
    const resolved = jsonOf(resolveRes) as unknown as {
      type: string;
      id: number;
    };
    expect(resolved.type).toBe("user_story");
    expect(resolved.id).toBe(story.id);
  });

  it("should edit and delete a comment via comment_edit/comment_delete", async () => {
    const createRes = (await mcpClient.callTool({
      name: "user_story_create",
      arguments: {
        project: projectId,
        subject: `E2E Comment Edit/Delete Story ${Date.now()}`,
      },
    })) as ToolResponse;
    const story = jsonOf(createRes);
    tracker.track("userstories", story.id);

    const commentText = `E2E editable comment ${Date.now()}`;
    const addRes = (await mcpClient.callTool({
      name: "comment_add",
      arguments: { resource: "user_story", id: story.id, comment: commentText },
    })) as ToolResponse;
    expect(addRes.isError).toBeFalsy();

    const listRes = (await mcpClient.callTool({
      name: "comment_list",
      arguments: { resource: "user_story", id: story.id },
    })) as ToolResponse;
    const history = JSON.parse(listRes.content[0]?.text ?? "{}") as {
      items: Array<{ id: string; comment?: string }>;
    };
    const entry = history.items.find((h) => h.comment === commentText);
    expect(entry).toBeDefined();

    const editRes = (await mcpClient.callTool({
      name: "comment_edit",
      arguments: {
        resource: "user_story",
        id: story.id,
        comment_id: entry?.id,
        comment: `${commentText} (edited)`,
      },
    })) as ToolResponse;
    expect(editRes.isError).toBeFalsy();

    const deleteRes = (await mcpClient.callTool({
      name: "comment_delete",
      arguments: {
        resource: "user_story",
        id: story.id,
        comment_id: entry?.id,
        confirm: true,
      },
    })) as ToolResponse;
    expect(deleteRes.isError).toBeFalsy();
  });

  it("should link then unlink a user story from an epic via epic_unlink_user_story", async () => {
    const createEpicRes = (await mcpClient.callTool({
      name: "epic_create",
      arguments: {
        project: projectId,
        subject: `E2E Unlink Epic ${Date.now()}`,
      },
    })) as ToolResponse;
    const epic = jsonOf(createEpicRes);
    tracker.track("epics", epic.id);

    const createStoryRes = (await mcpClient.callTool({
      name: "user_story_create",
      arguments: {
        project: projectId,
        subject: `E2E Unlink Story ${Date.now()}`,
      },
    })) as ToolResponse;
    const story = jsonOf(createStoryRes);
    tracker.track("userstories", story.id);

    await mcpClient.callTool({
      name: "epic_link_user_story",
      arguments: { id: epic.id, user_story: story.id },
    });

    const unlinkRes = (await mcpClient.callTool({
      name: "epic_unlink_user_story",
      arguments: { id: epic.id, user_story: story.id },
    })) as ToolResponse;
    expect(unlinkRes.isError).toBeFalsy();

    const relatedRes = (await mcpClient.callTool({
      name: "epic_related_user_stories",
      arguments: { id: epic.id },
    })) as ToolResponse;
    expect(relatedRes.content[0]?.text ?? "").not.toContain(String(story.id));
  });

  it("should upload then download an attachment and get back the same bytes", async () => {
    const createStoryRes = (await mcpClient.callTool({
      name: "user_story_create",
      arguments: {
        project: projectId,
        subject: `E2E Attachment Download Story ${Date.now()}`,
      },
    })) as ToolResponse;
    const story = jsonOf(createStoryRes);
    tracker.track("userstories", story.id);

    const fileContents = `E2E attachment round-trip ${Date.now()}`;
    const fileBase64 = Buffer.from(fileContents).toString("base64");

    const uploadRes = (await mcpClient.callTool({
      name: "attachment_upload",
      arguments: {
        resource: "user_story",
        object_id: story.id,
        project: projectId,
        file_name: "e2e-roundtrip.txt",
        file_base64: fileBase64,
        content_type: "text/plain",
      },
    })) as ToolResponse;
    const attachment = jsonOf(uploadRes);
    tracker.track("userstories/attachments", attachment.id);

    const downloadRes = (await mcpClient.callTool({
      name: "attachment_download",
      arguments: { resource: "user_story", id: attachment.id },
    })) as ToolResponse;
    expect(downloadRes.isError).toBeFalsy();
    const downloaded = jsonOf(downloadRes) as unknown as {
      file_base64: string;
      file_name: string;
    };
    expect(downloaded.file_base64).toBe(fileBase64);
    expect(downloaded.file_name).toBe("e2e-roundtrip.txt");
  });

  it("should batch-create user stories with one deliberate failure", async () => {
    const goodSubject = `E2E Batch Good ${Date.now()}`;
    const batchRes = (await mcpClient.callTool({
      name: "batch_create_user_stories",
      arguments: {
        project: projectId,
        items: [
          { subject: goodSubject },
          { subject: "E2E Batch Bad", milestone: 999_999_999 },
        ],
      },
    })) as ToolResponse;

    expect(batchRes.isError).toBeFalsy();
    const result = jsonOf(batchRes) as unknown as {
      total: number;
      succeededCount: number;
      failedCount: number;
      succeeded: Array<{ id: number; subject: string }>;
    };
    expect(result.total).toBe(2);
    expect(result.succeededCount).toBe(1);
    expect(result.failedCount).toBe(1);
    for (const s of result.succeeded) {
      tracker.track("userstories", s.id);
    }
  });

  it("should create a user story with a name-based assignee", async () => {
    const createRes = (await mcpClient.callTool({
      name: "user_story_create",
      arguments: {
        project: projectId,
        subject: `E2E Name-based Assignee ${Date.now()}`,
        assigned_to: currentUserEmail,
      },
    })) as ToolResponse;

    expect(createRes.isError).toBeFalsy();
    const story = jsonOf(createRes) as unknown as {
      id: number;
      assigned_to: number;
    };
    tracker.track("userstories", story.id);
    expect(story.assigned_to).toBe(currentUserId);
  });

  it("should paginate user_story_list and surface real pagination metadata", async () => {
    const subjectA = `E2E Pagination A ${Date.now()}`;
    const subjectB = `E2E Pagination B ${Date.now()}`;
    const createA = (await mcpClient.callTool({
      name: "user_story_create",
      arguments: { project: projectId, subject: subjectA },
    })) as ToolResponse;
    const createB = (await mcpClient.callTool({
      name: "user_story_create",
      arguments: { project: projectId, subject: subjectB },
    })) as ToolResponse;
    tracker.track("userstories", jsonOf(createA).id);
    tracker.track("userstories", jsonOf(createB).id);

    const listRes = (await mcpClient.callTool({
      name: "user_story_list",
      arguments: { project: projectId, page: 1, page_size: 1 },
    })) as ToolResponse;
    expect(listRes.isError).toBeFalsy();
    const body = JSON.parse(listRes.content[0]?.text ?? "{}") as {
      items: unknown[];
      pagination: { count: number; current_page: number; has_next: boolean };
    };
    expect(body.items).toHaveLength(1);
    expect(body.pagination.current_page).toBe(1);
    expect(body.pagination.has_next).toBe(true);
    expect(body.pagination.count).toBeGreaterThanOrEqual(2);
  });

  it("should trim fields per verbosity tier on user_story_get", async () => {
    const createRes = (await mcpClient.callTool({
      name: "user_story_create",
      arguments: {
        project: projectId,
        subject: `E2E Verbosity Story ${Date.now()}`,
        description: "full description text",
      },
    })) as ToolResponse;
    const story = jsonOf(createRes);
    tracker.track("userstories", story.id);

    const minimalRes = (await mcpClient.callTool({
      name: "user_story_get",
      arguments: { id: story.id, verbosity: "minimal" },
    })) as ToolResponse;
    const minimal = JSON.parse(minimalRes.content[0]?.text ?? "{}") as Record<
      string,
      unknown
    >;
    expect(Object.keys(minimal).sort()).toEqual(
      [
        "assigned_to",
        "id",
        "is_closed",
        "project",
        "ref",
        "status",
        "subject",
      ].sort(),
    );

    const standardRes = (await mcpClient.callTool({
      name: "user_story_get",
      arguments: { id: story.id, verbosity: "standard" },
    })) as ToolResponse;
    const standard = JSON.parse(standardRes.content[0]?.text ?? "{}") as Record<
      string,
      unknown
    >;
    expect(standard["description"]).toBe("full description text");
    expect(standard["description_html"]).toBeUndefined();
    expect(standard["assigned_to_extra_info"]).toBeUndefined();
  });

  it("should get user_story_filters_data for the project", async () => {
    const result = (await mcpClient.callTool({
      name: "user_story_filters_data",
      arguments: { project: projectId },
    })) as ToolResponse;

    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0]?.text ?? "{}") as {
      statuses: unknown[];
    };
    expect(Array.isArray(data.statuses)).toBe(true);
  });
});
