import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { TaigaClient } from "../../client/taiga-client.js";
import { createLogger } from "../../lib/logger.js";
import { createServer } from "../../server.js";
import { loadConfigFromEnv } from "./config.js";

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
    const server = createServer(client, {
      requireElicitation: config.requireElicitation,
    });
    const transport = new StdioServerTransport();
    await server.connect(transport);
  } catch (error) {
    logger.error({ err: error }, "taiga-mcp-server failed to start");
    process.exitCode = 1;
  }
}
