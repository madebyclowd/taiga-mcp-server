import { z } from "zod";

export const rawRequestInput = {
  method: z
    .enum(["GET", "POST", "PUT", "PATCH", "DELETE"])
    .describe(
      "`body` must be a JSON object (or omitted), never a JSON-encoded " +
        "string — the most common cause of a confusing 400 " +
        "'non_field_errors: Invalid data' with no other detail. " +
        "Separately, PATCH/PUT on some resources (user story, task, " +
        "issue, epic, wiki page — not project or membership) requires a " +
        "`version` field matching the resource's current value; omitting " +
        "it surfaces as a 409 conflict, not a 400. GET the resource " +
        "first to read `version`. Curated `_update` tools handle both of " +
        "these automatically; this raw tool does not.",
    ),
  path: z
    .string()
    .startsWith("/api/v1/")
    .refine((path) => !path.includes(".."), {
      message: 'Path traversal segments ("..") are not allowed.',
    })
    .describe(
      "Must be an /api/v1/... path on the configured Taiga instance — " +
        "no absolute URLs, no other hosts, no path traversal.",
    ),
  query: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .optional(),
  body: z
    .unknown()
    .optional()
    .refine((value) => typeof value !== "string", {
      message:
        "body must be a JSON object (or omitted), not a string. Pass the " +
        "object directly — do not JSON.stringify() it first; that " +
        "double-encodes it and Taiga rejects the result with a 400 " +
        "'non_field_errors: Invalid data' that doesn't name the real " +
        "problem. Confirmed live as the actual cause behind this exact " +
        "error shape (ai-docs/04_audits/" +
        "taiga-mcp-audit-03-talent-intelligence-field-feedback.md, " +
        "Finding 1's correction).",
    })
    .describe(
      "Must be a plain JSON object, never a pre-serialized JSON string. " +
        "For PATCH/PUT on a resource that requires OCC `version` (user " +
        "story, task, issue, epic, wiki page), include it matching the " +
        "resource's current value — GET it first.",
    ),
};
