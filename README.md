# @madebyclowd/taiga-mcp-server

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node Version](https://img.shields.io/badge/node-%5E22.11.0%20%7C%7C%20%5E24.0.0-brightgreen.svg)](package.json)
[![pnpm](https://img.shields.io/badge/pnpm-10.28.1-orange.svg)](https://pnpm.io/)

Production-ready, enterprise-standard [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server for [Taiga](https://taiga.io) (Cloud and self-hosted). Connect your AI assistants (Claude Desktop, Claude Code, Cursor, Windsurf, custom agents) directly to your Taiga project management workspace.

---

## Features

- 🛠️ **Complete Tool Coverage**:
  - **Projects**: Search and retrieve project metadata, epics, modules, and configurations.
  - **Epics**: Full CRUD operations, status management, and story linking.
  - **User Stories**: Create, update, list, delete, filter, assign, and track points/statuses.
  - **Tasks & Issues**: Full lifecycle management, severity, priority, and type handling.
  - **Sprints / Milestones**: Milestone creation, listing, story/task tracking.
  - **Wiki**: Read, update, and manage project wiki pages.
  - **Memberships**: List project members, roles, and administrative details.
  - **Comments & Attachments**: Add comments, retrieve discussion threads, manage file attachments.
  - **Vote & Watch**: Upvote or watch user stories, epics, and issues.
  - **Global Search**: Search across stories, epics, tasks, issues, and wiki pages.
  - **Escape Hatch (`taiga_raw_request`)**: Perform raw REST API calls to any Taiga endpoint with automatic auth, OCC, and retry handling.

- ⚡ **Dual Transport Support**:
  - **stdio Transport**: Standard input/output transport for local desktop clients (Claude Desktop, Cursor, Claude Code CLI).
  - **HTTP / SSE Transport**: HTTP Server-Sent Events transport supporting per-session credential isolation (`Authorization: Bearer <token>`) for remote or multi-tenant deployments.

- 🔒 **Enterprise-Grade Resilience & Security**:
  - **Optimistic Concurrency Control (OCC)**: Automatic version tracking and retry logic on `409 Conflict` errors during concurrent updates.
  - **Automatic Authentication & Refresh**: Transparent token management for password auth and personal tokens.
  - **Rate Limit & Retry Handling**: Intelligent exponential backoff on `429 Rate Limit` and standard network errors.
  - **Stdout Safety**: Strict logging encapsulation (`pino` writing to `stderr`) ensuring `stdout` remains 100% clean JSON-RPC for stdio transport integrity.
  - **Supply-Chain Integrity**: Signed npm releases with OIDC supply-chain provenance attestation (`--provenance`).

---

## Installation

You can run `@madebyclowd/taiga-mcp-server` directly via `npx`:

```bash
npx -y @madebyclowd/taiga-mcp-server
```

Or install it globally / locally in your project:

```bash
# Global installation
pnpm add -g @madebyclowd/taiga-mcp-server

# Local project installation
pnpm add @madebyclowd/taiga-mcp-server
```

---

## Configuration

### Environment Variables

#### Common (both transports)

| Variable         | Required | Description                                                                      | Default                |
| :--------------- | :------: | :------------------------------------------------------------------------------- | :--------------------- |
| `TAIGA_BASE_URL` |   Yes    | Target Taiga instance API URL (no trailing slash)                                | `https://api.taiga.io` |
| `LOG_LEVEL`      |    No    | Logging verbosity (`fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`) | `info`                 |

#### stdio transport (`taiga-mcp-server`)

One process-wide credential for the process lifetime — see
[Auth & Credential Handling](ai-docs/01_architecture/taiga-mcp-adr-002-auth-and-credential-handling.md).

| Variable         | Required | Description                                                            | Default |
| :--------------- | :------: | :--------------------------------------------------------------------- | :------ |
| `TAIGA_TOKEN`    |  Cond.   | Personal authentication token (preferred; overrides username/password) | -       |
| `TAIGA_USERNAME` |  Cond.   | Taiga account username (used if `TAIGA_TOKEN` is unset)                | -       |
| `TAIGA_PASSWORD` |  Cond.   | Taiga account password (used if `TAIGA_TOKEN` is unset)                | -       |

#### HTTP transport (`taiga-mcp-server-http`)

No process-wide credential — each session supplies its own via
`Authorization: Bearer <taiga-token>`.

| Variable               | Required | Description                                                                                                                                | Default                     |
| :--------------------- | :------: | :----------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------- |
| `HTTP_PORT`            |    No    | Port the HTTP server listens on                                                                                                            | `3000`                      |
| `HTTP_ALLOWED_ORIGINS` |    No    | Comma-separated CORS allowlist. **Unset reflects any Origin** — fine for local/team use, set explicitly for any internet-facing deployment | unset (reflects any Origin) |
| `HTTP_SESSION_TTL_MS`  |    No    | Idle-session expiry, in milliseconds                                                                                                       | `1800000` (30 min)          |
| `HTTP_MAX_SESSIONS`    |    No    | Cap on concurrent sessions — bounds memory use from unauthenticated session creation                                                       | `1000`                      |

---

## Client Integration Examples

### 1. Claude Desktop / Claude Code / Cursor / Windsurf (`stdio` Transport)

Add `@madebyclowd/taiga-mcp-server` to your client's MCP configuration file (e.g. `claude_desktop_config.json` or `.cursor/mcp.json`):

#### Using Personal Token (Recommended)

```json
{
  "mcpServers": {
    "taiga": {
      "command": "npx",
      "args": ["-y", "@madebyclowd/taiga-mcp-server"],
      "env": {
        "TAIGA_BASE_URL": "https://api.taiga.io",
        "TAIGA_TOKEN": "your-personal-taiga-auth-token"
      }
    }
  }
}
```

#### Using Username & Password

```json
{
  "mcpServers": {
    "taiga": {
      "command": "npx",
      "args": ["-y", "@madebyclowd/taiga-mcp-server"],
      "env": {
        "TAIGA_BASE_URL": "https://api.taiga.io",
        "TAIGA_USERNAME": "your-username",
        "TAIGA_PASSWORD": "your-password"
      }
    }
  }
}
```

---

### 2. HTTP / SSE Transport Mode

To run `@madebyclowd/taiga-mcp-server` as a standalone HTTP server handling remote MCP connections:

```bash
# Start the HTTP transport server — same package, the other bin it exposes
npx -y --package=@madebyclowd/taiga-mcp-server -- taiga-mcp-server-http
```

In HTTP transport mode, clients authenticate per-session by passing their Taiga bearer token in the HTTP request headers:

```http
POST /mcp HTTP/1.1
Host: localhost:3000
Content-Type: application/json
Authorization: Bearer <your-taiga-auth-token>
```

---

## Development & Contribution

### Setup & Build

```bash
# Install dependencies
pnpm install

# Build TypeScript output
pnpm build

# Run code linter
pnpm lint

# Check code formatting
pnpm format

# Typecheck
pnpm typecheck
```

### Testing & Auditing

```bash
# Run unit tests
pnpm test

# Run dependency security audit
pnpm audit

# Run live integration test suite (Requires .env.test configuration)
pnpm test:integration
```

For detailed instructions on setting up integration tests with a live Taiga instance, see [docs/testing.md](docs/testing.md).

---

## Security

See [SECURITY.md](SECURITY.md) for the vulnerability-reporting policy.

## License

This project is licensed under the [MIT License](LICENSE).
