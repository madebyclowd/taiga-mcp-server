import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { ElicitResult } from "@modelcontextprotocol/sdk/types.js";
import pino from "pino";
import { TaigaClient } from "../../../src/client/taiga-client.js";
import { createServer, type CreateServerOptions } from "../../../src/server.js";

export const BASE_URL = "https://taiga.example.test";

/**
 * Wires a real TaigaClient (pointed at the msw-mocked BASE_URL) into a
 * real McpServer, connected to a real MCP Client over an in-memory
 * transport pair. Tests drive tool calls through `client.callTool(...)`
 * exactly as a real MCP client would, exercising zod validation,
 * registration, and error mapping end-to-end.
 */
export async function createConnectedTestClient(
  serverOptions: CreateServerOptions = {},
): Promise<{
  client: Client;
  taigaClient: TaigaClient;
}> {
  const taigaClient = new TaigaClient({
    baseUrl: BASE_URL,
    credentials: { kind: "token", token: "test-token" },
    logger: pino({ level: "silent" }),
  });

  const server = createServer(taigaClient, serverOptions);
  const [serverTransport, clientTransport] =
    InMemoryTransport.createLinkedPair();

  const client = new Client({ name: "test-client", version: "0.0.1" });

  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  return { client, taigaClient };
}

/** A scripted `elicitation/create` response — `"hang"` never resolves, to
 * exercise the gate's timeout path (pair with fake timers). */
export type ElicitationScript = ElicitResult | "hang";

/**
 * Same wiring as `createConnectedTestClient`, but the test `Client`
 * declares the `elicitation` capability and answers `elicitation/create`
 * requests with whatever `respond()` returns — accept/decline/cancel, or
 * `"hang"` to never respond (for the timeout path).
 */
export async function createConnectedTestClientWithElicitation(
  respond: () => ElicitationScript,
  serverOptions: CreateServerOptions = {},
): Promise<{ client: Client; taigaClient: TaigaClient }> {
  const taigaClient = new TaigaClient({
    baseUrl: BASE_URL,
    credentials: { kind: "token", token: "test-token" },
    logger: pino({ level: "silent" }),
  });

  const server = createServer(taigaClient, serverOptions);
  const [serverTransport, clientTransport] =
    InMemoryTransport.createLinkedPair();

  const client = new Client(
    { name: "test-client-elicitation", version: "0.0.1" },
    { capabilities: { elicitation: {} } },
  );
  client.setRequestHandler(ElicitRequestSchema, () => {
    const script = respond();
    if (script === "hang") return new Promise<ElicitResult>(() => {});
    return script;
  });

  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  return { client, taigaClient };
}
