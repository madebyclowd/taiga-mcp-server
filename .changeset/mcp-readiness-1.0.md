---
"@madebyclowd/taiga-mcp-server": major
---

MCP protocol alignment and token-economy fixes, targeting `1.0.0` — the point at which the tool surface's public contract is considered stable.

**Breaking:**
- Every list-shaped tool's response is now `{ items, pagination }` instead of a bare array — `pagination` is `{ count, current_page, has_next }`, read from Taiga's real `x-pagination-*` headers where available (project/epic/user_story/task/issue/milestone/wiki/membership `_list`, `epic_related_user_stories`, `attachment_list`, `comment_list`), or synthesized from `search`'s own `count` field (search has no real pagination on Taiga's side).

**Additive:**
- `page`/`page_size` are now exposed on every list-shaped tool's input schema (Taiga already honored them; they just weren't declared). Default `page_size` is `30`, matching Taiga's own server-side default.
- New opt-in `verbosity: "minimal" | "standard" | "full"` param on every `_list`/`_get` tool across all 8 core resources. Defaults to `"full"` (today's unfiltered response, zero behavior change for existing callers). `"standard"` drops denormalized `*_extra_info` objects, `*_html` duplicate fields, and UI-only ordering fields. `"minimal"` keeps only `id`/`ref`/`subject`/`status`/`assigned_to`/`project`/`is_closed`.
- New `user_story_filters_data`/`task_filters_data`/`issue_filters_data` tools — cheap lookup of valid status/tag/assigned-user/etc ids for a project, instead of paging through a full `_list` call just to read them off.
- Every tool now declares MCP `annotations` (`readOnlyHint`/`destructiveHint`/`idempotentHint`/`openWorldHint`) and a human-readable `title`, so MCP clients that use these hints can distinguish safe reads from destructive writes without calling the tool.
- Tool responses are now compact JSON instead of pretty-printed — roughly 25-30% fewer tokens per response, no change in content.

**Migration**: any caller parsing a `_list`/`comment_list`/`attachment_list`/`epic_related_user_stories`/`search` tool's response as a bare array needs to read `.items` instead.
