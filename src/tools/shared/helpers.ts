import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { TaigaApiError } from "../../errors/taiga-error.js";

function jsonResult(data: unknown): CallToolResult {
  // JSON.stringify(undefined) returns undefined, not a string — a plain
  // `delete` call resolves to undefined (204 No Content), and the SDK
  // requires content[].text to be a string, so that case needs an
  // explicit fallback rather than silently producing an invalid frame.
  const text = data === undefined ? "null" : JSON.stringify(data);
  return { content: [{ type: "text", text }] };
}

/**
 * Maps a thrown error into an MCP tool error result, preserving
 * `TaigaApiError`'s structured field errors (never flattened to a
 * string) and stamping in the MCP tool name + the tool's own input
 * params — see
 * ai-docs/01_architecture/taiga-mcp-adr-004-resilience-and-error-handling.md.
 */
function toolErrorResult(
  error: unknown,
  tool: string,
  params: unknown,
): CallToolResult {
  if (error instanceof TaigaApiError) {
    const structured = { ...error.toStructured(), tool, params };
    return {
      isError: true,
      content: [{ type: "text", text: JSON.stringify(structured, null, 2) }],
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify({ tool, params, message }, null, 2),
      },
    ],
  };
}

/** Every tool handler routes its Taiga call through this — one place
 * that turns a result into `content` and an error into a structured
 * `isError` result, so no tool reimplements either. */
export async function handleTool(
  tool: string,
  params: unknown,
  fn: () => Promise<unknown>,
): Promise<CallToolResult> {
  try {
    const result = await fn();
    return jsonResult(result);
  } catch (error) {
    return toolErrorResult(error, tool, params);
  }
}
