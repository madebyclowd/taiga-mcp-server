import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TaigaClient } from "../client/taiga-client.js";
import { handleTool } from "./helpers.js";
import { searchInput } from "./schemas/search.js";

export function registerSearchTools(
  server: McpServer,
  client: TaigaClient,
): void {
  server.registerTool(
    "search",
    {
      description:
        "Project-scoped text search across epics, user stories, tasks, " +
        "issues, and wiki pages. Returns id/title matches grouped by type.",
      inputSchema: searchInput,
    },
    async (args) =>
      handleTool("search", args, () => client.get("/api/v1/search", args)),
  );
}
