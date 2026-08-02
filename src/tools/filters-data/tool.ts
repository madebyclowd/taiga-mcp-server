import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TaigaClient } from "../../client/taiga-client.js";
import { handleTool } from "../shared/helpers.js";
import { filtersDataInput } from "./schema.js";

/**
 * Thin passthrough to Taiga's `/{resource}/filters_data?project=X`
 * endpoints — confirmed live (phase 9) on user_story/task/issue only,
 * no epic equivalent exists on Taiga's side. Each returns small,
 * already-cheap enum-shaped arrays (statuses/tags/assigned_to/etc, each
 * entry carrying a live per-item `count`) — no pagination/verbosity
 * wrapping needed. Exists so an agent can look up valid filter ids
 * without a full `_list` call just to read them off returned items.
 */
export function registerFiltersDataTools(
  server: McpServer,
  client: TaigaClient,
): void {
  server.registerTool(
    "user_story_filters_data",
    {
      title: "User Story Filter Options",
      description:
        "Get the valid filter values (statuses, tags, assigned users, " +
        "epics, roles) for user stories in a project, each with a live " +
        "item count — cheaper than a full user_story_list call just to " +
        "discover ids.",
      inputSchema: filtersDataInput,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      handleTool("user_story_filters_data", args, () =>
        client.get("/api/v1/userstories/filters_data", args),
      ),
  );

  server.registerTool(
    "task_filters_data",
    {
      title: "Task Filter Options",
      description:
        "Get the valid filter values (statuses, tags, assigned users, " +
        "roles) for tasks in a project, each with a live item count — " +
        "cheaper than a full task_list call just to discover ids.",
      inputSchema: filtersDataInput,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      handleTool("task_filters_data", args, () =>
        client.get("/api/v1/tasks/filters_data", args),
      ),
  );

  server.registerTool(
    "issue_filters_data",
    {
      title: "Issue Filter Options",
      description:
        "Get the valid filter values (types, statuses, priorities, " +
        "severities, tags, assigned users, roles) for issues in a " +
        "project, each with a live item count — cheaper than a full " +
        "issue_list call just to discover ids.",
      inputSchema: filtersDataInput,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      handleTool("issue_filters_data", args, () =>
        client.get("/api/v1/issues/filters_data", args),
      ),
  );
}
