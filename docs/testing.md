# Integration Testing & CI Setup

This document describes how to set up, configure, and execute integration tests for `@madebyclowd/taiga-mcp-server`.

## Overview

Per ADR-005, the testing strategy for `@madebyclowd/taiga-mcp-server` uses two distinct test suites:

1. **Unit Tests (`pnpm test`)**: Uses `vitest` and `msw` (or in-memory mock transports). Runs fast, isolated, and requires no external network or API credentials. Runs automatically on all pull requests and commits.
2. **Integration Tests (`pnpm test:integration`)**: Executes end-to-end API tool calls against a **dedicated throwaway project** on a live Taiga instance (`tree.taiga.io` or self-hosted).

---

## Dummy Taiga Project Setup

To run integration tests against a live Taiga instance:

1. Log into your target Taiga instance (e.g. `api.taiga.io` / Taiga Cloud).
2. Create a new **dedicated throwaway project** (e.g., named `MCP CI Test Project`, requested slug `mcp-ci-test-project`).
   - **Free-plan accounts can't create another private project** once at
     the plan limit (`NotEnoughSlotsForProject`) — create it as
     **public** instead (`is_private: false`); a public project with a
     throwaway name has no real confidentiality downside here.
   - **Taiga Cloud auto-prefixes public-project slugs with the owner's
     username** (e.g. `alice-mcp-ci-test-project`) — the slug you
     request is not guaranteed to be the final one. Read back the
     actual `slug` from the creation response and use that everywhere
     (`TAIGA_TEST_PROJECT_SLUG`, GitHub secret, etc.).
   - **New projects have Epics disabled by default**
     (`is_epics_activated: false`). Since the epic tools are part of
     the curated surface under test, `PATCH` the project with
     `{"is_epics_activated": true}` right after creation (no `version`
     field needed — the project resource doesn't use Taiga's OCC
     scheme, unlike epics/stories/tasks/issues).
3. Ensure the test account has administrative access to this project so it can create and clean up test fixtures (User Stories, Epics, Tasks, Issues, Wiki pages).
4. Obtain API credentials for the test account:
   - **Option A (Personal Token)**: Copy your auth token.
   - **Option B (Username & Password)**: Use a dedicated CI bot user account credentials.

---

## Running Integration Tests Locally

1. Copy `.env.test.example` to `.env.test`:

   ```bash
   cp .env.test.example .env.test
   ```

2. Fill in your test credentials in `.env.test` or export them in your shell environment:

   ```bash
   export TAIGA_TEST_BASE_URL="https://api.taiga.io"
   export TAIGA_TEST_PROJECT_SLUG="mcp-ci-test-project"
   export TAIGA_TEST_USERNAME="your-ci-bot-user"
   export TAIGA_TEST_PASSWORD="your-ci-bot-password"
   ```

3. Run the integration test suite:
   ```bash
   pnpm test:integration
   ```

> **Note**: If no test credentials (`TAIGA_TEST_TOKEN` or `TAIGA_TEST_USERNAME`/`PASSWORD`) are present, the integration test suite safely skips execution without causing test failures.

---

## What the integration suite does and doesn't cover

- **Full CRUD + tool coverage**: every curated resource (projects, epics,
  user stories, tasks, issues, milestones, wiki pages, comments,
  vote/watch, search) is exercised through the actual MCP tool layer
  against the real API, plus the `taiga_raw_request` escape hatch.
- **OCC conflict handling**: `client.test.ts` forces a real stale-version
  `PATCH` and confirms Taiga's actual conflict response is classified as
  `TaigaConflictError`. This one matters more than it looks — Taiga
  signals an OCC conflict as **`400` with a bare `{"version": "..."}`
  string**, not a `409`, which contradicts the assumption the retry
  logic was originally built and mocked against (see
  `src/client/http.ts`'s `mapError`). The retry orchestration itself
  (fetch-then-patch, retry-once) is covered deterministically by the
  mocked unit test in `test/unit/client/occ.test.ts`.
- **429 (rate limit) is not exercised live.** Deliberately — there's no
  safe, deterministic way to trigger Taiga Cloud's real throttling from
  a CI run without either being flaky (depends on current account/IP
  state) or rude to a shared API (deliberately hammering it). The
  429-retry-with-backoff logic is covered by the mocked unit tests in
  `test/unit/client/http.test.ts` instead, per
  [[taiga-mcp-adr-005-testing-and-ci-strategy]]'s own accepted tradeoff
  for exactly this kind of untestable-in-CI behavior.

## CI Credential Management & Security

Integration tests are configured in `.github/workflows/ci.yml`.

- **Fork Protection**: Integration tests are restricted to `push` events on `main` and manual `workflow_dispatch`. They do **NOT** run on untrusted `pull_request` triggers from external forks to prevent secret leakage.
- **GitHub Environment**: Credentials are provided via GitHub Actions secrets in the `integration-test` environment:
  - `TAIGA_TEST_BASE_URL`
  - `TAIGA_TEST_PROJECT_SLUG`
  - `TAIGA_TEST_TOKEN` or `TAIGA_TEST_USERNAME` / `TAIGA_TEST_PASSWORD`
