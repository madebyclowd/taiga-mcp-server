import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import packageJson from "../package.json" with { type: "json" };
import { TaigaClient } from "./client/taiga-client.js";
import { loadConfigFromEnv } from "./config.js";
import { createLogger } from "./lib/logger.js";
import { registerTools } from "./tools/index.js";

export function createServer(client: TaigaClient): McpServer {
  const server = new McpServer({
    name: "server-taiga",
    version: packageJson.version,
  });
  registerTools(server, client);
  return server;
}

/**
 * Entry point for the stdio transport. Every failure here is logged
 * through the stderr-only logger — never `console.*` — since stdout is
 * the JSON-RPC wire once the transport is connected, and startup
 * failures (bad config) happen before that point too.
 */
export async function main(): Promise<void> {
  const logger = createLogger();
  try {
    const config = loadConfigFromEnv();
    const client = new TaigaClient({
      baseUrl: config.baseUrl,
      credentials: config.credentials,
      logger,
    });
    const server = createServer(client);
    const transport = new StdioServerTransport();
    await server.connect(transport);
  } catch (error) {
    logger.error({ err: error }, "server-taiga failed to start");
    process.exitCode = 1;
  }
}
