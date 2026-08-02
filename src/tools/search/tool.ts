import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TaigaClient } from "../../client/taiga-client.js";
import { handleTool } from "../shared/helpers.js";
import { searchInput } from "./schema.js";

/**
 * Taiga's `/api/v1/search` response is grouped by type
 * (`{epics, userstories, tasks, wikipages, issues, count}`), not a flat
 * array — and carries no `x-pagination-*` headers (live-confirmed, phase
 * 9), unlike every other list-shaped tool in this server. Wrapped as
 * `{ items, pagination }` for response-shape consistency with the rest
 * of the server, but `items` holds the grouped object as-is (forcing it
 * into a flat array would lose the type grouping that makes this useful)
 * and `pagination` is synthesized from the endpoint's own `count` field
 * rather than real headers.
 */
export function registerSearchTools(
  server: McpServer,
  client: TaigaClient,
): void {
  server.registerTool(
    "search",
    {
      title: "Search",
      description:
        "Project-scoped text search across epics, user stories, tasks, " +
        "issues, and wiki pages. Returns id/title matches grouped by " +
        "type. Response is { items: {epics, userstories, tasks, " +
        "wikipages, issues}, pagination }.",
      inputSchema: searchInput,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      handleTool("search", args, async () => {
        const body = await client.get<
          Record<string, unknown> & { count: number }
        >("/api/v1/search", args);
        const { count, ...items } = body;
        return {
          items,
          pagination: { count, current_page: 1, has_next: false },
        };
      }),
  );
}
