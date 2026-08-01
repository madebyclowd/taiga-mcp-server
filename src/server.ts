import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import packageJson from "../package.json" with { type: "json" };
import type { TaigaClient } from "./client/taiga-client.js";
import { registerTools } from "./tools/index.js";

/**
 * Builds the transport-agnostic MCP server (tool registration only, no
 * transport wiring) — shared by both the stdio (`transports/stdio/`)
 * and HTTP (`transports/http/`) entry points, per
 * ai-docs/01_architecture/taiga-mcp-adr-003-transport-strategy.md.
 */
export function createServer(client: TaigaClient): McpServer {
  const server = new McpServer({
    name: "server-taiga",
    version: packageJson.version,
  });
  registerTools(server, client);
  return server;
}
