import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TaigaClient } from "../../client/taiga-client.js";
import { TaigaValidationError } from "../../errors/taiga-error.js";
import { handleTool } from "../shared/helpers.js";
import { rawRequestInput } from "./schema.js";

const MALFORMED_BODY_HINT =
  " Hint: this generic 'Invalid data' error with no named field usually " +
  "means the request body wasn't valid object data as Taiga's API " +
  "expects — most commonly, `body` was passed as a JSON-encoded string " +
  "(double-encoded) instead of a plain object. Zod now rejects a string " +
  "`body` outright before this point, so if you're still seeing this: " +
  "double-check the body shape matches what Taiga's docs expect for " +
  "this exact endpoint.";

/**
 * Taiga signals a malformed/unparseable request body with a generic
 * 400 (`non_field_errors: ["Invalid data"]`) that names no specific
 * field. Live-verified (2026-08-02, see
 * ai-docs/04_audits/taiga-mcp-audit-03-talent-intelligence-field-feedback.md,
 * Finding 1's correction) against the real Talent Intelligence
 * project: this exact shape reproduces when `body` is passed as a
 * JSON-encoded *string* rather than an object — NOT from a missing OCC
 * `version` field as originally assumed. Confirmed on the same pass
 * that PATCH without `version` on project/membership succeeds outright
 * (those resources don't require it), and on user-stories (which does
 * require it) surfaces as a 409 conflict instead, a different error
 * class entirely. The schema-level `body` refine (raw-request/schema.ts)
 * now rejects a string body before it ever reaches Taiga — this handler
 * check is a backstop for any other way this same shape could occur.
 */
function looksLikeMalformedBody(error: TaigaValidationError): boolean {
  return (
    error.fields.length === 1 &&
    error.fields[0]?.field === "non_field_errors" &&
    (error.fields[0]?.messages.includes("Invalid data") ?? false)
  );
}

/**
 * Escape hatch for everything not hand-typed as a curated tool:
 * importers, webhooks, application tokens, resolver, notify policies,
 * user storage, stats/discover endpoints, project templates,
 * export/import. Routes through the same `TaigaClient` — full
 * auth/retry/OCC/logging behavior still applies, this does not bypass
 * phase 1. The zod schema itself enforces the method allow-list and
 * `/api/v1/`-only, no-traversal path constraint; nothing here re-checks
 * what zod already rejected before the handler runs.
 */
export function registerRawRequestTools(
  server: McpServer,
  client: TaigaClient,
): void {
  server.registerTool(
    "taiga_raw_request",
    {
      title: "Raw Taiga API Request",
      description:
        "Escape hatch: make a raw request to any /api/v1/ endpoint on " +
        "the configured Taiga instance, for functionality not covered " +
        "by a dedicated tool (importers, webhooks, application tokens, " +
        "notify policies, project templates, export/import, etc.). " +
        "Prefer a dedicated tool when one exists.",
      inputSchema: rawRequestInput,
      // Method is caller-chosen (GET/POST/PUT/PATCH/DELETE) — can't claim
      // readOnlyHint/destructiveHint/idempotentHint honestly at
      // registration time, only that it always hits live Taiga state.
      annotations: { openWorldHint: true },
    },
    async (args) =>
      handleTool("taiga_raw_request", args, async () => {
        try {
          return await client.request({
            method: args.method,
            path: args.path,
            query: args.query,
            body: args.body,
          });
        } catch (error) {
          if (
            error instanceof TaigaValidationError &&
            looksLikeMalformedBody(error)
          ) {
            error.message += MALFORMED_BODY_HINT;
          }
          throw error;
        }
      }),
  );
}
