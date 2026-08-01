import { PassThrough, Writable } from "node:stream";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import pino from "pino";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { TaigaClient } from "../../../src/client/taiga-client.js";
import { createServer } from "../../../src/server.js";

const BASE_URL = "https://taiga.example.test";

const mswServer = setupServer();
beforeAll(() => mswServer.listen({ onUnhandledRequest: "error" }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

function captureStdout(): { stdout: Writable; lines: () => string[] } {
  const chunks: string[] = [];
  const stdout = new Writable({
    write(chunk: Buffer, _enc, callback) {
      chunks.push(chunk.toString("utf8"));
      callback();
    },
  });
  return {
    stdout,
    lines: () =>
      chunks
        .join("")
        .split("\n")
        .filter((line) => line.length > 0),
  };
}

function writeLine(stdin: PassThrough, message: unknown): void {
  stdin.write(JSON.stringify(message) + "\n");
}

/**
 * Drives the *real* StdioServerTransport (the class actually used in
 * production, via src/server.ts's main()) with injected stdin/stdout
 * streams instead of the process's real ones, then asserts every byte
 * written to "stdout" is a parseable, newline-delimited JSON-RPC frame.
 *
 * This is the concrete regression test for the hazard called out in
 * ai-docs/01_architecture/taiga-mcp-adr-004-resilience-and-error-handling.md:
 * on the stdio transport, stdout is the JSON-RPC wire, so any stray
 * write there (a reintroduced `console.log`, a dependency that logs to
 * stdout by default) corrupts the protocol stream. If that regresses,
 * `JSON.parse` on the offending line throws and this test fails.
 */
describe("stdio transport stdout safety", () => {
  it("writes only parseable JSON-RPC frames to stdout across a full tool-call cycle", async () => {
    mswServer.use(
      http.get(`${BASE_URL}/api/v1/projects`, () =>
        HttpResponse.json([{ id: 1 }]),
      ),
    );

    const taigaClient = new TaigaClient({
      baseUrl: BASE_URL,
      credentials: { kind: "token", token: "t" },
      logger: pino({ level: "silent" }),
    });
    const server = createServer(taigaClient);

    const stdin = new PassThrough();
    const { stdout, lines } = captureStdout();
    const transport = new StdioServerTransport(stdin, stdout);

    await server.connect(transport);

    writeLine(stdin, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "stdout-safety-test", version: "0.0.1" },
      },
    });
    writeLine(stdin, { jsonrpc: "2.0", method: "notifications/initialized" });
    writeLine(stdin, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "project_list", arguments: {} },
    });

    await vi.waitFor(() => {
      expect(lines().length).toBeGreaterThanOrEqual(2);
    });

    const parsedMessages = lines().map((line) => {
      // Any non-JSON-RPC content on stdout (e.g. a leaked log line)
      // fails right here, at JSON.parse — this is the check.
      const parsed: unknown = JSON.parse(line);
      expect(parsed).toMatchObject({ jsonrpc: "2.0" });
      return parsed as { id?: number; result?: { isError?: boolean } };
    });

    const toolCallResponse = parsedMessages.find((message) => message.id === 2);
    expect(toolCallResponse?.result?.isError).toBeFalsy();

    await server.close();
  });
});
