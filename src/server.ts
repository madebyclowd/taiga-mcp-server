import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import packageJson from "../package.json" with { type: "json" };
import type { TaigaClient } from "./client/taiga-client.js";
import { registerTools } from "./tools/index.js";

export interface CreateServerOptions {
  /**
   * When true, every delete-capable tool refuses to delete for clients
   * that don't declare the `elicitation` capability — the `confirm:
   * true` fallback becomes a hard "not deleted" for those clients
   * instead of an agent-satisfiable two-call pattern. Default false
   * (preserves the existing fallback). See
   * ai-docs/02_planning/taiga-mcp-plan-06-destructive-op-safety.md.
   */
  requireElicitation?: boolean | undefined;
}

/**
 * Builds the transport-agnostic MCP server (tool registration only, no
 * transport wiring) — shared by both the stdio (`transports/stdio/`)
 * and HTTP (`transports/http/`) entry points, per
 * ai-docs/01_architecture/taiga-mcp-adr-003-transport-strategy.md.
 */
export function createServer(
  client: TaigaClient,
  options: CreateServerOptions = {},
): McpServer {
  const server = new McpServer({
    name: "taiga-mcp-server",
    version: packageJson.version,
  });
  registerTools(server, client, options.requireElicitation ?? false);
  return server;
}
