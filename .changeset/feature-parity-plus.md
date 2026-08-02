---
"@madebyclowd/taiga-mcp-server": minor
---

Six gap-closing additions vs. reference implementations, targeting `0.3.0`:

- New `ref_resolve` tool — resolves a project-scoped ref (e.g. `"#436"` or `436`) to its type (`issue`/`user_story`/`task`/`epic`) and numeric id via Taiga's `/resolver` endpoint.
- New `comment_edit`/`comment_delete` tools for epic/user_story/task/issue comments. `comment_delete` routes through the same destructive-op confirmation gate as every other delete.
- New `epic_unlink_user_story` tool, mirroring the existing `epic_link_user_story`.
- New `attachment_download` tool — returns file contents as base64 (matching how `attachment_upload` already takes base64 in), with filename/content-type/size/sha1, rejecting files over a 10 MiB cap before downloading.
- New `batch_create_issues`/`batch_create_user_stories`/`batch_create_tasks` tools — up to 20 items per call, each created independently with per-item partial-failure reporting (`{ succeeded, failed, total, succeededCount, failedCount }`).
- `assigned_to` and the new `watchers` field on epic/user_story/task/issue create+update tools now accept a numeric user id, an email/full-name string (resolved against the project's members), or `null` (explicit unassign). Omitting the field still leaves it unchanged. Ambiguous or unresolvable names return a structured `{ error: "no_match" | "ambiguous_match", identifier, candidates }` error rather than a silent guess.

All additive — existing numeric-id usage of `assigned_to` is unaffected.
