import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import pino from "pino";
import { TaigaClient } from "../../../src/client/taiga-client.js";
import { createServer } from "../../../src/server.js";

export const BASE_URL = "https://taiga.example.test";

/**
 * Wires a real TaigaClient (pointed at the msw-mocked BASE_URL) into a
 * real McpServer, connected to a real MCP Client over an in-memory
 * transport pair. Tests drive tool calls through `client.callTool(...)`
 * exactly as a real MCP client would, exercising zod validation,
 * registration, and error mapping end-to-end.
 */
export async function createConnectedTestClient(): Promise<{
  client: Client;
  taigaClient: TaigaClient;
}> {
  const taigaClient = new TaigaClient({
    baseUrl: BASE_URL,
    credentials: { kind: "token", token: "test-token" },
    logger: pino({ level: "silent" }),
  });

  const server = createServer(taigaClient);
  const [serverTransport, clientTransport] =
    InMemoryTransport.createLinkedPair();

  const client = new Client({ name: "test-client", version: "0.0.1" });

  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  return { client, taigaClient };
}
