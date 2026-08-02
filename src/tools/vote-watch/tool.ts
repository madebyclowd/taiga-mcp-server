import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TaigaClient } from "../../client/taiga-client.js";
import { handleTool } from "../shared/helpers.js";
import { RESOURCE_REGISTRY } from "../shared/resource-registry.js";
import { voteInput, watchInput } from "./schema.js";

/** All 4 tools below are toggle-style — repeating a call converges to
 * the same end state (still upvoted/watched, or still not), so
 * idempotentHint: true throughout. None are destructive. */
const toggleAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

/**
 * Taiga's vote/watch actions all return `200` with an **empty body**
 * (not `404` and not a JSON payload) — confirmed live during phase 3,
 * which is also what surfaced the `http.ts` empty-body-on-200 fix these
 * tools depend on. There's no "remove" via `DELETE`; unvoting/unwatching
 * are their own `POST` actions (`downvote`/`unwatch`), not a toggle on
 * the same endpoint.
 */
export function registerVoteWatchTools(
  server: McpServer,
  client: TaigaClient,
): void {
  server.registerTool(
    "vote_add",
    {
      title: "Upvote",
      description:
        "Upvote an epic, user story, task, or issue. Milestones and " +
        "wiki pages don't support voting.",
      inputSchema: voteInput,
      annotations: toggleAnnotations,
    },
    async (args) => {
      const entry = RESOURCE_REGISTRY[args.resource];
      return handleTool("vote_add", args, () =>
        client.create(`${entry.basePath}/${String(args.id)}/upvote`, {}),
      );
    },
  );

  server.registerTool(
    "vote_remove",
    {
      title: "Remove Vote",
      description: "Remove your vote from an epic, user story, task, or issue.",
      inputSchema: voteInput,
      annotations: toggleAnnotations,
    },
    async (args) => {
      const entry = RESOURCE_REGISTRY[args.resource];
      return handleTool("vote_remove", args, () =>
        client.create(`${entry.basePath}/${String(args.id)}/downvote`, {}),
      );
    },
  );

  server.registerTool(
    "watch_add",
    {
      title: "Watch",
      description:
        "Watch an epic, user story, task, issue, milestone, or wiki page " +
        "for update notifications.",
      inputSchema: watchInput,
      annotations: toggleAnnotations,
    },
    async (args) => {
      const entry = RESOURCE_REGISTRY[args.resource];
      return handleTool("watch_add", args, () =>
        client.create(`${entry.basePath}/${String(args.id)}/watch`, {}),
      );
    },
  );

  server.registerTool(
    "watch_remove",
    {
      title: "Unwatch",
      description:
        "Stop watching an epic, user story, task, issue, milestone, or wiki page.",
      inputSchema: watchInput,
      annotations: toggleAnnotations,
    },
    async (args) => {
      const entry = RESOURCE_REGISTRY[args.resource];
      return handleTool("watch_remove", args, () =>
        client.create(`${entry.basePath}/${String(args.id)}/unwatch`, {}),
      );
    },
  );
}
