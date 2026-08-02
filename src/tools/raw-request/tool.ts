import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TaigaClient } from "../../client/taiga-client.js";
import { handleTool } from "../shared/helpers.js";
import { rawRequestInput } from "./schema.js";

/**
 * Escape hatch for everything not hand-typed as a curated tool:
 * importers, webhooks, application tokens, resolver, notify policies,
 * user storage, stats/discover endpoints, project templates,
 * export/import. Routes through the same `TaigaClient` — full
 * auth/retry/OCC/logging behavior still applies, this does not bypass
 * phase 1. The zod schema itself enforces the method allow-list and
 * `/api/v1/`-only, no-traversal path constraint; nothing here re-checks
 * what zod already rejected before the handler runs.
 */
export function registerRawRequestTools(
  server: McpServer,
  client: TaigaClient,
): void {
  server.registerTool(
    "taiga_raw_request",
    {
      title: "Raw Taiga API Request",
      description:
        "Escape hatch: make a raw request to any /api/v1/ endpoint on " +
        "the configured Taiga instance, for functionality not covered " +
        "by a dedicated tool (importers, webhooks, application tokens, " +
        "notify policies, project templates, export/import, etc.). " +
        "Prefer a dedicated tool when one exists.",
      inputSchema: rawRequestInput,
      // Method is caller-chosen (GET/POST/PUT/PATCH/DELETE) — can't claim
      // readOnlyHint/destructiveHint/idempotentHint honestly at
      // registration time, only that it always hits live Taiga state.
      annotations: { openWorldHint: true },
    },
    async (args) =>
      handleTool("taiga_raw_request", args, () =>
        client.request({
          method: args.method,
          path: args.path,
          query: args.query,
          body: args.body,
        }),
      ),
  );
}
