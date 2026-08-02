import type { TaigaClient } from "../../client/taiga-client.js";

const MEMBERSHIP_BASE_PATH = "/api/v1/memberships";

/**
 * `membership_create`/`membership_bulk_create`'s `email` field has no
 * backing field on Taiga's real `/api/v1/memberships` endpoint — only
 * `username` exists, and it happens to also accept an email-shaped
 * string. Confirmed live via real field feedback (see
 * ai-docs/04_audits/taiga-mcp-audit-03-talent-intelligence-field-feedback.md,
 * Finding 2). Maps `email` -> `username` only when `username` isn't
 * already set — an explicit `username` always wins.
 */
export function mapEmailToUsername<
  T extends { email?: string | undefined; username?: string | undefined },
>(entry: T): T {
  if (typeof entry.email !== "string" || entry.email.length === 0) {
    return entry;
  }
  // `email` is never a real field on Taiga's endpoint — always strip it.
  // Its value becomes `username` only when no explicit username was given.
  const { email, ...rest } = entry;
  if (typeof entry.username === "string") return rest as T;
  return { ...rest, username: email } as T;
}

/**
 * `registerCrudTools`'s `transformWriteArgs` hook for the membership
 * resource. Two unrelated jobs share this single hook because both are
 * scoped to one resource and the generator only accepts one hook per
 * resource:
 *
 * - **Create**: applies `mapEmailToUsername` (Finding 2).
 * - **Update**: `is_admin` is a privilege-escalation field, not an
 *   ordinary boolean — every change gets a mandatory structured
 *   audit-log line (membership id, old/new value), mirroring the audit
 *   trail `destructive-confirm.ts` already keeps for deletes (phase 6).
 *   Not gated behind the elicitation/confirm flow deletes use — that's
 *   scoped to irreversible ops, and an `is_admin` flip is trivially
 *   reversible by another `membership_update` call; an audit trail is
 *   the proportionate fix (see
 *   ai-docs/02_planning/taiga-mcp-plan-10-field-feedback-fixes.md,
 *   decision 4). Reads the pre-patch value with its own GET rather than
 *   reusing `updateWithVersion`'s internal one (not exposed to this
 *   hook) — an accepted extra round-trip on a low-frequency admin
 *   operation, not a hot path.
 */
export function createMembershipWriteTransform(
  client: TaigaClient,
): (args: Record<string, unknown>) => Promise<Record<string, unknown>> {
  return async (args) => {
    if (typeof args.id !== "number") {
      return mapEmailToUsername(args);
    }

    if (typeof args.is_admin === "boolean") {
      const current = await client.get<{ is_admin?: boolean }>(
        `${MEMBERSHIP_BASE_PATH}/${String(args.id)}`,
      );
      client.logger.info(
        {
          event: "membership_is_admin_change",
          membershipId: args.id,
          oldValue: current.is_admin ?? false,
          newValue: args.is_admin,
        },
        "membership is_admin change",
      );
    }

    return args;
  };
}
