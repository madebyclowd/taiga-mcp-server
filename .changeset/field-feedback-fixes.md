---
"@madebyclowd/taiga-mcp-server": patch
---

Fixes from real-project field feedback (Talent Intelligence project dogfood):

- `taiga_raw_request` now rejects a `body` passed as a JSON-encoded string (the confirmed real cause of a confusing 400 `non_field_errors: Invalid data` with no other detail) before the request ever reaches Taiga, and appends an actionable hint to that same error shape if it's ever seen from another source.
- `membership_create`/`membership_bulk_create`'s `email` field now actually works — it's mapped to Taiga's real `username` field (which accepts an email-shaped string) instead of being silently dropped.
- `membership_update` gains an `is_admin` field to grant/revoke project-admin rights; every change is unconditionally audit-logged (membership id, old/new value).
- `project_update` gains `is_backlog_activated`/`is_kanban_activated`/`is_wiki_activated`/`is_issues_activated`/`is_epics_activated` module-toggle fields; `epic_create`'s description now flags that an epic created while `is_epics_activated` is off stays invisible in Taiga's web UI until the module is enabled.
- Transport-level network failures (DNS/connection reset/timeout) are now retried up to 2 times with backoff — but only for `GET`, never for a write, to avoid a double-write on retry.

All changes are additive or validation/documentation-only — no breaking response-shape or tool-name changes.
