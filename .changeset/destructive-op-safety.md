---
"@madebyclowd/taiga-mcp-server": minor
---

Every `<resource>_delete` tool (and `attachment_delete`) now routes through a confirmation gate before mutating anything. Elicitation-capable clients are prompted interactively with the entity's title; other clients get a preview on the first call and must re-call with `confirm: true` to proceed. Declining, cancelling, or timing out returns a clear non-error result — nothing is deleted. `id` still works the same; `confirm` is additive.

Every delete attempt is now also audit-logged (resource, id, title, capability path, outcome) via the server's structured logger, even on the two-call fallback path.

New opt-in `TAIGA_REQUIRE_ELICITATION` env var (default off): when set, clients that don't declare the `elicitation` capability are refused outright on delete — the `confirm: true` fallback is no longer honored for them, closing the gap where an autonomous agent could self-approve its own deletion without a real human in the loop.
