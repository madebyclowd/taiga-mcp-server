import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TaigaClient } from "../../client/taiga-client.js";
import { confirmDestructiveOpGivenSummary } from "../shared/destructive-confirm.js";
import { handleTool } from "../shared/helpers.js";
import { RESOURCE_REGISTRY } from "../shared/resource-registry.js";
import { applyVerbosityToItems } from "../shared/response-fields.js";
import {
  DEFAULT_VERBOSITY,
  paginationShape,
  verbosityShape,
} from "../shared/list-params.js";
import {
  commentAddInput,
  commentDeleteInput,
  commentEditInput,
  commentListInput,
} from "./schema.js";

interface HistoryEntry {
  id: string;
  comment?: string;
}

/**
 * Taiga has no separate "comment" object — comments live in each
 * resource's history/timeline. Adding one is a `PATCH` on the resource
 * itself with a `comment` field (so it goes through the normal OCC
 * version path); listing reads `/api/v1/history/{type}/{id}`, where
 * each history entry has its own `comment` field (empty string for
 * entries that are plain field-change events, not comments) — confirmed
 * against a live Taiga instance during phase 3.
 *
 * Editing/deleting a specific comment is a separate pair of endpoints,
 * `POST /api/v1/history/{type}/{id}/edit_comment?id={commentId}` and
 * `.../delete_comment?id={commentId}` (`commentId` is the history
 * entry's own uuid `id`, not the parent resource's id) — confirmed live
 * against the real Taiga Cloud test project during phase 7
 * implementation, including that `epic` supports both despite the
 * official docs' endpoint table omitting it.
 */
export function registerCommentTools(
  server: McpServer,
  client: TaigaClient,
  requireElicitation = false,
): void {
  server.registerTool(
    "comment_add",
    {
      title: "Add Comment",
      description:
        "Add a comment to an epic, user story, task, or issue. Goes " +
        "through the same optimistic-concurrency path as a normal update.",
      inputSchema: commentAddInput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
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
      title: "List Comments",
      description:
        "List the comment history for an epic, user story, task, or " +
        "issue. Includes plain field-change history entries too — " +
        "filter on a non-empty `comment` field for comments only. " +
        "Response is { items, pagination }.",
      inputSchema: {
        ...commentListInput,
        ...paginationShape,
        ...verbosityShape,
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) => {
      const entry = RESOURCE_REGISTRY[args.resource];
      return handleTool("comment_list", args, async () => {
        const result = await client.listPaginated<Record<string, unknown>[]>(
          `/api/v1/history/${entry.historySlug}/${String(args.id)}`,
          { page: args.page, page_size: args.page_size },
        );
        return {
          items: applyVerbosityToItems(
            result.items,
            args.verbosity ?? DEFAULT_VERBOSITY,
          ),
          pagination: result.pagination,
        };
      });
    },
  );

  server.registerTool(
    "comment_edit",
    {
      title: "Edit Comment",
      description:
        "Edit the text of an existing comment on an epic, user story, " +
        "task, or issue. Not gated — editing isn't destructive.",
      inputSchema: commentEditInput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      const entry = RESOURCE_REGISTRY[args.resource];
      return handleTool("comment_edit", args, () =>
        client.request({
          method: "POST",
          path: `/api/v1/history/${entry.historySlug}/${String(args.id)}/edit_comment`,
          query: { id: args.comment_id },
          body: { comment: args.comment },
        }),
      );
    },
  );

  server.registerTool(
    "comment_delete",
    {
      title: "Delete Comment",
      description:
        "Delete a comment from an epic, user story, task, or issue. " +
        "This cannot be undone. Requires confirmation: elicitation-capable " +
        "clients are prompted interactively; others must call again with " +
        "confirm: true after reviewing the preview returned by the first call.",
      inputSchema: commentDeleteInput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) => {
      const entry = RESOURCE_REGISTRY[args.resource];
      const historyPath = `/api/v1/history/${entry.historySlug}/${String(args.id)}`;

      // No single-comment GET exists on Taiga — the only way to build a
      // real preview is to list the parent's history and find the entry
      // client-side, same call `comment_list` already makes.
      const history = await client.list<HistoryEntry[]>(historyPath);
      const target = history.find((h) => h.id === args.comment_id);
      const preview = target?.comment;
      const message = preview
        ? `Delete comment ${args.comment_id} on ${args.resource} #${String(args.id)}: '${preview}'?`
        : `Delete comment ${args.comment_id} on ${args.resource} #${String(args.id)}?`;

      const gate = await confirmDestructiveOpGivenSummary({
        server,
        client,
        resourceLabel: "comment",
        id: args.comment_id,
        summary: { message, title: preview },
        args,
        requireElicitation,
      });
      if (!gate.proceed) {
        return {
          content: [
            { type: "text", text: gate.message ?? "Not deleted — cancelled." },
          ],
        };
      }
      return handleTool("comment_delete", args, () =>
        client.request({
          method: "POST",
          path: `${historyPath}/delete_comment`,
          query: { id: args.comment_id },
        }),
      );
    },
  );
}
