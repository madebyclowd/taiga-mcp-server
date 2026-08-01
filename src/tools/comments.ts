import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TaigaClient } from "../client/taiga-client.js";
import { handleTool } from "./helpers.js";
import { RESOURCE_REGISTRY } from "./resource-registry.js";
import { commentAddInput, commentListInput } from "./schemas/comment.js";

/**
 * Taiga has no separate "comment" object — comments live in each
 * resource's history/timeline. Adding one is a `PATCH` on the resource
 * itself with a `comment` field (so it goes through the normal OCC
 * version path); listing reads `/api/v1/history/{type}/{id}`, where
 * each history entry has its own `comment` field (empty string for
 * entries that are plain field-change events, not comments) — confirmed
 * against a live Taiga instance during phase 3.
 */
export function registerCommentTools(
  server: McpServer,
  client: TaigaClient,
): void {
  server.registerTool(
    "comment_add",
    {
      description:
        "Add a comment to an epic, user story, task, or issue. Goes " +
        "through the same optimistic-concurrency path as a normal update.",
      inputSchema: commentAddInput,
    },
    async (args) => {
      const entry = RESOURCE_REGISTRY[args.resource];
      return handleTool("comment_add", args, () =>
        client.updateWithVersion(`${entry.basePath}/${String(args.id)}`, {
          comment: args.comment,
        }),
      );
    },
  );

  server.registerTool(
    "comment_list",
    {
      description:
        "List the comment history for an epic, user story, task, or " +
        "issue. Includes plain field-change history entries too — " +
        "filter on a non-empty `comment` field for comments only.",
      inputSchema: commentListInput,
    },
    async (args) => {
      const entry = RESOURCE_REGISTRY[args.resource];
      return handleTool("comment_list", args, () =>
        client.list(`/api/v1/history/${entry.historySlug}/${String(args.id)}`),
      );
    },
  );
}
