import { TaigaApiError } from "../../errors/taiga-error.js";
import type { TaigaClient } from "../../client/taiga-client.js";

const MEMBERSHIP_BASE_PATH = "/api/v1/memberships";

/**
 * Shape returned by `GET /api/v1/memberships?project=<id>` — only the
 * fields resolution actually reads. Confirmed live against a real Taiga
 * Cloud project: membership objects have **no `username` field** at
 * all (despite the reference implementation checking one) — only
 * `full_name`, `email`, and `user_email` (the latter two are the same
 * value in practice but documented as distinct concepts, so both are
 * checked).
 */
export interface ProjectMember {
  user: number;
  full_name?: string | undefined;
  email?: string | undefined;
  user_email?: string | undefined;
}

interface MemberCandidate {
  id: number;
  full_name: string | undefined;
  email: string | undefined;
}

function toCandidate(member: ProjectMember): MemberCandidate {
  return {
    id: member.user,
    full_name: member.full_name,
    email: member.email ?? member.user_email,
  };
}

/**
 * Structured error for a failed name-based resolution — thrown instead
 * of a generic `Error` so `handleTool` surfaces `{ error, identifier,
 * candidates }` programmatically (matching plan doc decision 11), not a
 * flattened message string.
 */
export class MemberResolutionError extends TaigaApiError {
  readonly kind: "no_match" | "ambiguous_match";
  readonly identifier: string;
  readonly candidates: MemberCandidate[];

  constructor(options: {
    kind: "no_match" | "ambiguous_match";
    identifier: string;
    candidates: MemberCandidate[];
  }) {
    super({
      status: 400,
      message:
        options.kind === "no_match"
          ? `No project member matches "${options.identifier}".`
          : `"${options.identifier}" matches more than one project member.`,
    });
    this.name = "MemberResolutionError";
    this.kind = options.kind;
    this.identifier = options.identifier;
    this.candidates = options.candidates;
  }

  override toStructured(): ReturnType<TaigaApiError["toStructured"]> & {
    error: "no_match" | "ambiguous_match";
    identifier: string;
    candidates: MemberCandidate[];
  } {
    return {
      ...super.toStructured(),
      error: this.kind,
      identifier: this.identifier,
      candidates: this.candidates,
    };
  }
}

/**
 * Resolves a single identifier against a pre-fetched member list — exact
 * match only (no fuzzy/substring), case-insensitive consistently across
 * `email`/`full_name` (plan doc decision 9 also names `username`, but
 * that field doesn't actually exist on `/api/v1/memberships` responses
 * — confirmed live; `user_email` is checked too since it's a distinct
 * documented field even though it holds the same value as `email` in
 * practice). A numeric identifier is a direct passthrough, no lookup.
 * More than one match or zero matches both throw `MemberResolutionError`
 * rather than silently picking one (decision 10) — never call this
 * speculatively; only when `needsResolution` says a string identifier is
 * actually present.
 */
export function resolveMemberIdentifier(
  members: ProjectMember[],
  identifier: number | string,
): number {
  if (typeof identifier === "number") return identifier;

  const needle = identifier.toLowerCase();
  const matches = members.filter(
    (m) =>
      m.email?.toLowerCase() === needle ||
      m.user_email?.toLowerCase() === needle ||
      m.full_name?.toLowerCase() === needle,
  );

  if (matches.length === 1) return matches[0]!.user;

  if (matches.length === 0) {
    throw new MemberResolutionError({
      kind: "no_match",
      identifier,
      candidates: members.map(toCandidate),
    });
  }

  throw new MemberResolutionError({
    kind: "ambiguous_match",
    identifier,
    candidates: matches.map(toCandidate),
  });
}

/** Resolves every entry in a watchers array — a single unresolvable
 * identifier fails the whole array (decision 15: all-or-nothing), since
 * `Array#map` stops at the first thrown error. */
export function resolveWatcherIdentifiers(
  members: ProjectMember[],
  watchers: Array<number | string>,
): number[] {
  return watchers.map((identifier) =>
    resolveMemberIdentifier(members, identifier),
  );
}

export interface ResolvableWriteArgs {
  assigned_to?: number | string | null | undefined;
  watchers?: Array<number | string> | undefined;
}

/** True only when a member-list fetch is actually needed — skips the
 * common case where every identifier is already numeric (decision 12). */
export function needsResolution(args: ResolvableWriteArgs): boolean {
  if (typeof args.assigned_to === "string") return true;
  if (Array.isArray(args.watchers)) {
    return args.watchers.some((w) => typeof w === "string");
  }
  return false;
}

/** `null` means explicit unassign (passed straight through); a string
 * identifier is resolved; `undefined`/omitted stays untouched by the
 * caller (this function is only invoked when the field is present). */
export function resolveAssignmentFields(
  members: ProjectMember[],
  args: ResolvableWriteArgs,
): Partial<{ assigned_to: number | null; watchers: number[] }> {
  const resolved: Partial<{ assigned_to: number | null; watchers: number[] }> =
    {};
  if (args.assigned_to !== undefined) {
    resolved.assigned_to =
      args.assigned_to === null
        ? null
        : resolveMemberIdentifier(members, args.assigned_to);
  }
  if (args.watchers !== undefined) {
    resolved.watchers = resolveWatcherIdentifiers(members, args.watchers);
  }
  return resolved;
}

/**
 * Builds a `transformWriteArgs` hook for `registerCrudTools` — resolves
 * name-based `assigned_to`/`watchers` identifiers against the resource's
 * project members, fetching the member list at most once per tool call
 * and only when actually needed (decision 12). `getProjectId` covers
 * both call shapes: on create, `args.project` is already present; on
 * update it isn't, so the resource itself must be fetched first to read
 * its `project` field — one extra GET, only paid when resolution is
 * actually needed.
 */
export function createAssignmentTransform(
  client: TaigaClient,
  getProjectId: (args: Record<string, unknown>) => Promise<number> | number,
): (args: Record<string, unknown>) => Promise<Record<string, unknown>> {
  return async (args) => {
    if (!needsResolution(args)) return args;

    const projectId = await getProjectId(args);
    const members = await client.list<ProjectMember[]>(MEMBERSHIP_BASE_PATH, {
      project: projectId,
    });
    const resolved = resolveAssignmentFields(members, args);
    return { ...args, ...resolved };
  };
}
