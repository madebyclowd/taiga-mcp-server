import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TaigaClient } from "../../client/taiga-client.js";

const DEFAULT_TIMEOUT_MS = 300_000;

export interface ConfirmDestructiveOpOptions {
  server: McpServer;
  client: TaigaClient;
  /** e.g. "/api/v1/epics" */
  basePath: string;
  id: number | string;
  /** Singular, lowercase, e.g. "epic" — used in the human-readable prompt. */
  resourceLabel: string;
  /** The tool's own input args — only `confirm` is read here. */
  args: { confirm?: boolean | undefined };
  /** Injectable for tests; defaults to 5 minutes. */
  timeoutMs?: number;
  /**
   * When true, a client that doesn't declare the `elicitation`
   * capability can never delete — the `confirm: true` fallback is
   * refused outright rather than honored. Off by default (preserves the
   * existing preview/confirm fallback); an operator opts in via
   * `TAIGA_REQUIRE_ELICITATION=true` for deployments that want a real
   * human-in-loop gate rather than an agent-satisfiable one. See
   * ai-docs/02_planning/taiga-mcp-plan-06-destructive-op-safety.md.
   */
  requireElicitation?: boolean | undefined;
}

export interface ConfirmDestructiveOpResult {
  proceed: boolean;
  /** Present when `proceed` is false — a clear, non-error explanation. */
  message?: string;
}

function extractTitle(entity: unknown): string | undefined {
  if (typeof entity !== "object" || entity === null) return undefined;
  const record = entity as Record<string, unknown>;
  for (const field of ["subject", "title", "slug", "name"]) {
    const value = record[field];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

/** Fire-and-forget audit trail for every delete attempt — the only
 * record of what an irreversible Taiga DELETE targeted, since Taiga's
 * API has no soft-delete/undo to fall back on. */
function auditLog(
  client: TaigaClient,
  fields: {
    resource: string;
    id: number | string;
    title: string | undefined;
    capability: "elicitation" | "fallback";
    outcome:
      | "confirmed"
      | "declined"
      | "cancelled"
      | "timeout"
      | "blocked"
      | "awaiting_confirm";
  },
): void {
  client.logger.info(
    { event: "destructive_op_delete", ...fields },
    "destructive-op gate",
  );
}

/**
 * Shared gate every `<resource>_delete` tool (generated or hand-written)
 * routes through before mutating anything — see
 * ai-docs/02_planning/taiga-mcp-plan-06-destructive-op-safety.md. Fetches
 * the entity first so the human sees a real preview, then either drives a
 * native `elicitInput` confirmation (clients that declare the
 * `elicitation` capability) or falls back to a preview/`confirm:true`
 * pattern. Declining, cancelling, and timing out are all treated as a
 * normal "not deleted" result, never a thrown error — callers must not
 * route this through `handleTool`, which always maps a thrown error to
 * `isError: true`.
 */
export async function confirmDestructiveOp(
  options: ConfirmDestructiveOpOptions,
): Promise<ConfirmDestructiveOpResult> {
  const { server, client, basePath, id, resourceLabel, args } = options;
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const requireElicitation = options.requireElicitation ?? false;

  const entity = await client.get(`${basePath}/${String(id)}`);
  const title = extractTitle(entity);
  const summary = title
    ? `Delete ${resourceLabel} #${String(id)} '${title}'?`
    : `Delete ${resourceLabel} #${String(id)}?`;

  const capabilities = server.server.getClientCapabilities();
  if (capabilities?.elicitation) {
    try {
      const result = await server.server.elicitInput(
        {
          message: summary,
          requestedSchema: {
            type: "object",
            properties: {
              confirm: { type: "boolean", title: "Confirm deletion" },
            },
            required: ["confirm"],
          },
        },
        { timeout },
      );

      if (result.action === "accept" && result.content?.confirm === true) {
        auditLog(client, {
          resource: resourceLabel,
          id,
          title,
          capability: "elicitation",
          outcome: "confirmed",
        });
        return { proceed: true };
      }
      const outcome = result.action === "cancel" ? "cancelled" : "declined";
      auditLog(client, {
        resource: resourceLabel,
        id,
        title,
        capability: "elicitation",
        outcome,
      });
      return { proceed: false, message: "Not deleted — cancelled." };
    } catch (error) {
      if (
        error instanceof McpError &&
        error.code === Number(ErrorCode.RequestTimeout)
      ) {
        auditLog(client, {
          resource: resourceLabel,
          id,
          title,
          capability: "elicitation",
          outcome: "timeout",
        });
        return {
          proceed: false,
          message: "Not deleted — confirmation timed out.",
        };
      }
      throw error;
    }
  }

  if (requireElicitation) {
    auditLog(client, {
      resource: resourceLabel,
      id,
      title,
      capability: "fallback",
      outcome: "blocked",
    });
    return {
      proceed: false,
      message:
        `${summary} Blocked: this server requires an elicitation-capable ` +
        "MCP client for destructive operations, and this client does not " +
        "declare that capability. confirm: true is not honored.",
    };
  }

  if (args.confirm === true) {
    auditLog(client, {
      resource: resourceLabel,
      id,
      title,
      capability: "fallback",
      outcome: "confirmed",
    });
    return { proceed: true };
  }
  auditLog(client, {
    resource: resourceLabel,
    id,
    title,
    capability: "fallback",
    outcome: "awaiting_confirm",
  });
  return {
    proceed: false,
    message: `${summary} Re-call this tool with confirm: true to proceed.`,
  };
}
