export type Verbosity = "minimal" | "standard" | "full";

/**
 * `standard` drops these by pattern/name rather than a per-resource
 * static field table (contrast with `RESOURCE_REGISTRY`'s per-resource
 * style, `../shared/resource-registry.ts`) — deliberate: the drop-rule
 * itself is already one mechanical pattern (every `*_extra_info`
 * denormalized object, every `*_html` duplicate-of-plain-text field,
 * plus the four named UI-only ordering fields), confirmed live against
 * real Taiga user-story/task/issue/epic objects (phase 9). A pattern
 * catches a field Taiga adds later automatically (e.g. a hypothetical
 * future `foo_extra_info`); a hardcoded per-resource list would
 * silently miss it — more robust to drift, not less, despite having no
 * per-resource table to eyeball.
 */
const STANDARD_DROP_PATTERN = /_extra_info$|_html$/;
const STANDARD_DROP_EXACT = new Set([
  "backlog_order",
  "sprint_order",
  "kanban_order",
  "swimlane",
]);

/**
 * `minimal`'s allowlist is a plain key intersection, so it naturally
 * yields "whichever of these 7 fields the resource actually has"
 * without per-resource branching (e.g. `wiki`/`membership` don't carry
 * all 7 — the ones they lack are simply absent from the result).
 */
const MINIMAL_FIELDS = new Set([
  "id",
  "ref",
  "subject",
  "status",
  "assigned_to",
  "project",
  "is_closed",
]);

/** Trims a single Taiga object's fields per verbosity tier. */
export function applyVerbosity(
  obj: Record<string, unknown>,
  verbosity: Verbosity,
): Record<string, unknown> {
  if (verbosity === "full") return obj;

  const result: Record<string, unknown> = {};
  if (verbosity === "minimal") {
    for (const key of Object.keys(obj)) {
      if (MINIMAL_FIELDS.has(key)) result[key] = obj[key];
    }
    return result;
  }

  for (const key of Object.keys(obj)) {
    if (STANDARD_DROP_PATTERN.test(key) || STANDARD_DROP_EXACT.has(key)) {
      continue;
    }
    result[key] = obj[key];
  }
  return result;
}

/** Maps `applyVerbosity` over a list response's items. */
export function applyVerbosityToItems(
  items: Record<string, unknown>[],
  verbosity: Verbosity,
): Record<string, unknown>[] {
  if (verbosity === "full") return items;
  return items.map((item) => applyVerbosity(item, verbosity));
}
