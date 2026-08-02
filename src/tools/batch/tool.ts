import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TaigaApiError } from "../../errors/taiga-error.js";
import type { TaigaClient } from "../../client/taiga-client.js";
import { handleTool } from "../shared/helpers.js";
import {
  batchCreateIssuesInput,
  batchCreateTasksInput,
  batchCreateUserStoriesInput,
} from "./schema.js";

interface BatchSucceeded {
  index: number;
  id: number;
  ref: number | undefined;
  subject: string;
}

interface BatchFailed {
  index: number;
  subject: string;
  error: unknown;
}

interface BatchResult {
  succeeded: BatchSucceeded[];
  failed: BatchFailed[];
  total: number;
  succeededCount: number;
  failedCount: number;
}

function describeError(error: unknown): unknown {
  if (error instanceof TaigaApiError) return error.toStructured();
  return { message: error instanceof Error ? error.message : String(error) };
}

/**
 * Sequential per-item `client.create` loop, not Taiga's native
 * `bulk_create` — that endpoint only takes one newline-separated string
 * of bare subjects plus shared top-level fields, no per-item fields
 * (confirmed by reading the docs directly; also how the reference
 * implementation does it). Cap 20 per call, one bad item doesn't fail
 * the rest.
 */
async function batchCreate(
  client: TaigaClient,
  basePath: string,
  project: number,
  items: Array<{ subject: string } & Record<string, unknown>>,
): Promise<BatchResult> {
  const succeeded: BatchSucceeded[] = [];
  const failed: BatchFailed[] = [];

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    if (!item) continue;
    try {
      const created = await client.create<{
        id: number;
        ref?: number;
        subject: string;
      }>(basePath, { project, ...item });
      succeeded.push({
        index,
        id: created.id,
        ref: created.ref,
        subject: created.subject,
      });
    } catch (error) {
      failed.push({
        index,
        subject: item.subject,
        error: describeError(error),
      });
    }
  }

  return {
    succeeded,
    failed,
    total: items.length,
    succeededCount: succeeded.length,
    failedCount: failed.length,
  };
}

export function registerBatchTools(
  server: McpServer,
  client: TaigaClient,
): void {
  server.registerTool(
    "batch_create_issues",
    {
      title: "Batch Create Issues",
      description:
        "Create up to 20 issues in one call. Each item is created " +
        "independently — a bad item doesn't fail the others. Returns a " +
        "structured result with per-item success/failure, not a native " +
        "Taiga bulk-create (which can't carry per-item fields).",
      inputSchema: batchCreateIssuesInput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) =>
      handleTool("batch_create_issues", args, () =>
        batchCreate(client, "/api/v1/issues", args.project, args.items),
      ),
  );

  server.registerTool(
    "batch_create_user_stories",
    {
      title: "Batch Create User Stories",
      description:
        "Create up to 20 user stories in one call. Each item is created " +
        "independently — a bad item doesn't fail the others. Returns a " +
        "structured result with per-item success/failure, not a native " +
        "Taiga bulk-create (which can't carry per-item fields).",
      inputSchema: batchCreateUserStoriesInput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) =>
      handleTool("batch_create_user_stories", args, () =>
        batchCreate(client, "/api/v1/userstories", args.project, args.items),
      ),
  );

  server.registerTool(
    "batch_create_tasks",
    {
      title: "Batch Create Tasks",
      description:
        "Create up to 20 tasks in one call, each under its own parent " +
        "user story. Each item is created independently — a bad item " +
        "doesn't fail the others. Returns a structured result with " +
        "per-item success/failure, not a native Taiga bulk-create (which " +
        "can't carry per-item fields).",
      inputSchema: batchCreateTasksInput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) =>
      handleTool("batch_create_tasks", args, () =>
        batchCreate(client, "/api/v1/tasks", args.project, args.items),
      ),
  );
}
