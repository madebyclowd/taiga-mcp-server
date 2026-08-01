import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TaigaClient } from "../../client/taiga-client.js";
import { handleTool } from "../shared/helpers.js";
import { RESOURCE_REGISTRY } from "../shared/resource-registry.js";
import { voteInput, watchInput } from "./schema.js";

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
      description:
        "Upvote an epic, user story, task, or issue. Milestones and " +
        "wiki pages don't support voting.",
      inputSchema: voteInput,
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
      description: "Remove your vote from an epic, user story, task, or issue.",
      inputSchema: voteInput,
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
      description:
        "Watch an epic, user story, task, issue, milestone, or wiki page " +
        "for update notifications.",
      inputSchema: watchInput,
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
      description:
        "Stop watching an epic, user story, task, issue, milestone, or wiki page.",
      inputSchema: watchInput,
    },
    async (args) => {
      const entry = RESOURCE_REGISTRY[args.resource];
      return handleTool("watch_remove", args, () =>
        client.create(`${entry.basePath}/${String(args.id)}/unwatch`, {}),
      );
    },
  );
}
