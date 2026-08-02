# @madebyclowd/taiga-mcp-server

## 1.0.1

### Patch Changes

- a2eb1c6: Fixes from real-project field feedback (Talent Intelligence project dogfood):

  - `taiga_raw_request` now rejects a `body` passed as a JSON-encoded string (the confirmed real cause of a confusing 400 `non_field_errors: Invalid data` with no other detail) before the request ever reaches Taiga, and appends an actionable hint to that same error shape if it's ever seen from another source.
  - `membership_create`/`membership_bulk_create`'s `email` field now actually works — it's mapped to Taiga's real `username` field (which accepts an email-shaped string) instead of being silently dropped.
  - `membership_update` gains an `is_admin` field to grant/revoke project-admin rights; every change is unconditionally audit-logged (membership id, old/new value).
  - `project_update` gains `is_backlog_activated`/`is_kanban_activated`/`is_wiki_activated`/`is_issues_activated`/`is_epics_activated` module-toggle fields; `epic_create`'s description now flags that an epic created while `is_epics_activated` is off stays invisible in Taiga's web UI until the module is enabled.
  - Transport-level network failures (DNS/connection reset/timeout) are now retried up to 2 times with backoff — but only for `GET`, never for a write, to avoid a double-write on retry.

  All changes are additive or validation/documentation-only — no breaking response-shape or tool-name changes.

## 1.0.0

### Major Changes

- a4a0012: MCP protocol alignment and token-economy fixes, targeting `1.0.0` — the point at which the tool surface's public contract is considered stable.

  **Breaking:**
  - Every list-shaped tool's response is now `{ items, pagination }` instead of a bare array — `pagination` is `{ count, current_page, has_next }`, read from Taiga's real `x-pagination-*` headers where available (project/epic/user_story/task/issue/milestone/wiki/membership `_list`, `epic_related_user_stories`, `attachment_list`, `comment_list`), or synthesized from `search`'s own `count` field (search has no real pagination on Taiga's side).

  **Additive:**
  - `page`/`page_size` are now exposed on every list-shaped tool's input schema (Taiga already honored them; they just weren't declared). Default `page_size` is `30`, matching Taiga's own server-side default.
  - New opt-in `verbosity: "minimal" | "standard" | "full"` param on every `_list`/`_get` tool across all 8 core resources. Defaults to `"full"` (today's unfiltered response, zero behavior change for existing callers). `"standard"` drops denormalized `*_extra_info` objects, `*_html` duplicate fields, and UI-only ordering fields. `"minimal"` keeps only `id`/`ref`/`subject`/`status`/`assigned_to`/`project`/`is_closed`.
  - New `user_story_filters_data`/`task_filters_data`/`issue_filters_data` tools — cheap lookup of valid status/tag/assigned-user/etc ids for a project, instead of paging through a full `_list` call just to read them off.
  - Every tool now declares MCP `annotations` (`readOnlyHint`/`destructiveHint`/`idempotentHint`/`openWorldHint`) and a human-readable `title`, so MCP clients that use these hints can distinguish safe reads from destructive writes without calling the tool.
  - Tool responses are now compact JSON instead of pretty-printed — roughly 25-30% fewer tokens per response, no change in content.

  **Migration**: any caller parsing a `_list`/`comment_list`/`attachment_list`/`epic_related_user_stories`/`search` tool's response as a bare array needs to read `.items` instead.

### Minor Changes

- 2df2df7: Six gap-closing additions vs. reference implementations, targeting `0.3.0`:

  - New `ref_resolve` tool — resolves a project-scoped ref (e.g. `"#436"` or `436`) to its type (`issue`/`user_story`/`task`/`epic`) and numeric id via Taiga's `/resolver` endpoint.
  - New `comment_edit`/`comment_delete` tools for epic/user_story/task/issue comments. `comment_delete` routes through the same destructive-op confirmation gate as every other delete.
  - New `epic_unlink_user_story` tool, mirroring the existing `epic_link_user_story`.
  - New `attachment_download` tool — returns file contents as base64 (matching how `attachment_upload` already takes base64 in), with filename/content-type/size/sha1, rejecting files over a 10 MiB cap before downloading.
  - New `batch_create_issues`/`batch_create_user_stories`/`batch_create_tasks` tools — up to 20 items per call, each created independently with per-item partial-failure reporting (`{ succeeded, failed, total, succeededCount, failedCount }`).
  - `assigned_to` and the new `watchers` field on epic/user_story/task/issue create+update tools now accept a numeric user id, an email/full-name string (resolved against the project's members), or `null` (explicit unassign). Omitting the field still leaves it unchanged. Ambiguous or unresolvable names return a structured `{ error: "no_match" | "ambiguous_match", identifier, candidates }` error rather than a silent guess.

  All additive — existing numeric-id usage of `assigned_to` is unaffected.

## 0.2.0

### Minor Changes

- e223083: Every `<resource>_delete` tool (and `attachment_delete`) now routes through a confirmation gate before mutating anything. Elicitation-capable clients are prompted interactively with the entity's title; other clients get a preview on the first call and must re-call with `confirm: true` to proceed. Declining, cancelling, or timing out returns a clear non-error result — nothing is deleted. `id` still works the same; `confirm` is additive.

  Every delete attempt is now also audit-logged (resource, id, title, capability path, outcome) via the server's structured logger, even on the two-call fallback path.

  New opt-in `TAIGA_REQUIRE_ELICITATION` env var (default off): when set, clients that don't declare the `elicitation` capability are refused outright on delete — the `confirm: true` fallback is no longer honored for them, closing the gap where an autonomous agent could self-approve its own deletion without a real human in the loop.

## 0.1.1

### Patch Changes

- 4915a3c: Bump pino from 9.14.0 to 10.3.1 (no breaking changes affecting this package's usage).

## 0.1.0

### Minor Changes

- ef6d6a3: Initial release 0.1.0 of `@madebyclowd/taiga-mcp-server` MCP server with support for both stdio and HTTP/SSE transports, complete tool coverage (projects, epics, user stories, tasks, issues, sprints, wiki, memberships, comments, attachments, search, raw-request), Optimistic Concurrency Control (OCC), structured logging, security auditing, and integration test suite.
