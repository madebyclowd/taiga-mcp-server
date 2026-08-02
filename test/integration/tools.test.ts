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

    const me = await taigaClient.get<{ id: number }>("/api/v1/users/me");
    currentUserId = me.id;
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
});
