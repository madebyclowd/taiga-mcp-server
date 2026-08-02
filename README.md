# Taiga MCP Server

Let AI assistants like **Claude**, **Cursor**, and **Windsurf** read and update your **[Taiga](https://taiga.io)** projects — epics, user stories, tasks, issues, sprints, comments, and wiki pages — just by chatting with them.

This is an **MCP server**. MCP stands for **Model Context Protocol** — a standard way for AI assistants to connect to outside tools and data. This package is the "tool" that lets an AI assistant talk to your Taiga account.

Package on npm: [`@madebyclowd/taiga-mcp-server`](https://www.npmjs.com/package/@madebyclowd/taiga-mcp-server)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/@madebyclowd/taiga-mcp-server.svg)](https://www.npmjs.com/package/@madebyclowd/taiga-mcp-server)
[![Node Version](https://img.shields.io/badge/node-%5E22.11.0%20%7C%7C%20%5E24.0.0-brightgreen.svg)](package.json)

> **Not an official Taiga product.** This is an independent, open-source integration.

---

## Table of contents

- [What can I actually do with this?](#what-can-i-actually-do-with-this)
- [Before you start](#before-you-start)
- [Install](#install)
- [Set it up with Claude Desktop, Claude Code, Cursor, or Windsurf](#set-it-up-with-claude-desktop-claude-code-cursor-or-windsurf)
- [Running it as a shared HTTP server instead](#running-it-as-a-shared-http-server-instead)
- [All settings (environment variables)](#all-settings-environment-variables)
- [What's covered, and how it handles problems](#whats-covered-and-how-it-handles-problems)
- [Frequently asked questions](#frequently-asked-questions)
- [Contributing / running the tests](#contributing--running-the-tests)
- [Security](#security)
- [License](#license)

---

## What can I actually do with this?

Once it's connected, you can ask your AI assistant things like:

- "Show me all open bugs in the Website project."
- "Create a task called 'Fix login button' under the current sprint."
- "Move user story #482 to the QA column."
- "Summarize what changed on epic #12 this week."
- "Search the wiki for our deployment steps."

The assistant does this by calling this server, which talks to Taiga's real API using your own Taiga login. It only does what your Taiga account is already allowed to do — it can't see or change anything you don't already have permission for.

It supports:

- **Projects, epics, user stories, tasks, issues, sprints (milestones), wiki pages, comments, attachments, project members, voting/watching, and search.**
- A fallback "raw request" tool for the rare Taiga API endpoint that doesn't have a dedicated tool yet (webhooks, import/export, and similar admin-level features).

## Before you start

You need:

1. **A Taiga account** — either on [Taiga Cloud](https://taiga.io) or a self-hosted Taiga instance.
2. **Node.js** version 22.11 or newer, or version 24 or newer.
3. **An AI assistant that supports MCP** — Claude Desktop, Claude Code, Cursor, Windsurf, or any other MCP-compatible client.

You do **not** need to install or run anything Taiga-related yourself — this connects to your existing Taiga account over the internet (or your self-hosted instance's URL).

## Install

You don't need to install this by hand. Your AI assistant will download and run it automatically the first time it's used, via `npx`. If you'd rather install it yourself:

```bash
# Run it once, without installing anything permanently
npx -y @madebyclowd/taiga-mcp-server
```

Or install it globally, using whichever package manager you already use — you only need one of these:

```bash
pnpm add -g @madebyclowd/taiga-mcp-server
# or
npm install -g @madebyclowd/taiga-mcp-server
```

## Set it up with Claude Desktop, Claude Code, Cursor, or Windsurf

All of these tools use the same kind of config file, usually a JSON file with an `mcpServers` section. Add this to yours:

### Option A: using a Taiga access token (recommended)

This is the safer option — your password is never stored anywhere.

1. Log into Taiga in your browser.
2. Get your auth token (in Taiga Cloud, this is available via your account settings or the API; for self-hosted Taiga, ask your admin how tokens are issued).
3. Add this to your config:

```json
{
  "mcpServers": {
    "taiga": {
      "command": "npx",
      "args": ["-y", "@madebyclowd/taiga-mcp-server"],
      "env": {
        "TAIGA_BASE_URL": "https://api.taiga.io",
        "TAIGA_TOKEN": "your-taiga-auth-token"
      }
    }
  }
}
```

### Option B: using your username and password

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

**Using self-hosted Taiga?** Just change `TAIGA_BASE_URL` to your own instance's URL, for example `https://taiga.mycompany.com`.

After saving the config, restart your AI assistant (or reload its MCP connections). It should now show Taiga tools as available.

## Running it as a shared HTTP server instead

The setup above (called "stdio") runs a private copy of the server just for you, on your own computer. If you instead want to run **one shared server** that a team can connect to over the network, use the HTTP mode.

The important difference: in HTTP mode, nobody's Taiga login is stored on the server. Each person connecting sends their **own** Taiga token with each request, so everyone keeps their own Taiga permissions and audit trail — nobody has to share one account.

```bash
# Start the HTTP server — same package, a different command it exposes
npx -y --package=@madebyclowd/taiga-mcp-server -- taiga-mcp-server-http
```

Each client connects by sending their Taiga token in a standard HTTP header:

```http
POST /mcp HTTP/1.1
Host: your-server:3000
Content-Type: application/json
Authorization: Bearer <your-taiga-auth-token>
```

If you're exposing this server on the internet (not just on your own machine or local network), read the `HTTP_ALLOWED_ORIGINS` note in the settings table below — the default is permissive on purpose for easy local/team use, and you should lock it down for a public deployment.

## All settings (environment variables)

### Used by both modes

| Setting          | Required? | What it does                                               | Default                |
| :--------------- | :-------: | :--------------------------------------------------------- | :--------------------- |
| `TAIGA_BASE_URL` |    Yes    | The Taiga API address to connect to.                       | `https://api.taiga.io` |
| `LOG_LEVEL`      |    No     | How much the server logs (`error`, `info`, `debug`, etc.). | `info`                 |

### Only for the normal (stdio) mode

| Setting          |              Required?               | What it does                                               |
| :--------------- | :----------------------------------: | :--------------------------------------------------------- |
| `TAIGA_TOKEN`    |    One of these three is required    | Your Taiga access token. Preferred over username/password. |
| `TAIGA_USERNAME` | Required if you're not using a token | Your Taiga username.                                       |
| `TAIGA_PASSWORD` | Required if you're not using a token | Your Taiga password.                                       |

### Only for HTTP server mode

In HTTP mode, the server itself doesn't hold any Taiga login — each connecting client sends its own token, so none of the settings below are about credentials.

| Setting                | Required? | What it does                                                                                                                                                                                           | Default                  |
| :--------------------- | :-------: | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------- |
| `HTTP_PORT`            |    No     | Which network port the server listens on.                                                                                                                                                              | `3000`                   |
| `HTTP_ALLOWED_ORIGINS` |    No     | Comma-separated list of websites allowed to connect from a browser (CORS). If unset, any website is allowed — fine for local/team use, but set this explicitly if you're exposing the server publicly. | unset (any site allowed) |
| `HTTP_SESSION_TTL_MS`  |    No     | How long an idle connection stays open before it's automatically closed, in milliseconds.                                                                                                              | `1800000` (30 minutes)   |
| `HTTP_MAX_SESSIONS`    |    No     | The most connections the server will hold open at once, to keep memory use bounded.                                                                                                                    | `1000`                   |

## What's covered, and how it handles problems

Plain description of what happens behind the scenes, so you know what to expect:

- **It uses your own Taiga permissions.** If you can't see or edit something in Taiga's own web app, this server can't either — it's making the same API calls your browser would.
- **Your password/token is never written to disk or logged.** It's only kept in memory while the server is running.
- **If two people edit the same item at the same time**, Taiga would normally reject the second save. This server automatically re-fetches the latest version and retries the save once instead of just failing.
- **If Taiga temporarily rate-limits requests**, the server waits and retries automatically instead of giving up right away.
- **Errors are returned in a structured way** (which field was wrong, and why) instead of a generic "something went wrong" — this helps the AI assistant actually understand and fix the problem instead of guessing.
- **Tested against the real Taiga API**, not just simulated responses — the automated test suite includes tests that run against an actual Taiga project, in addition to the usual offline tests.
- Released with **npm provenance** — a signed record proving the published package was built from this exact GitHub repository, not modified or uploaded from somewhere else.

This is an early release (`0.1.0`). It's been tested carefully, including live against the real Taiga API, but it hasn't had real-world use by others yet — if you hit a problem, please [report it](#security).

## Frequently asked questions

**What is Taiga?**
[Taiga](https://taiga.io) is a project management tool, similar to Jira or Linear — used for tracking epics, user stories, tasks, bugs, and sprints.

**What is MCP / Model Context Protocol?**
It's a standard that lets AI assistants (like Claude) connect to external tools and data sources in a consistent way, instead of every integration being custom-built. This package implements that standard for Taiga.

**Is this made by the Taiga team?**
No. This is an independent, open-source project, not affiliated with or endorsed by Taiga/Kaleidos.

**Do I need to run my own server?**
No, for normal personal use. Your AI assistant starts and stops this server automatically in the background. You only need to run it yourself as a standalone server if you're setting it up for a team (see [HTTP mode](#running-it-as-a-shared-http-server-instead)).

**Does this work with self-hosted Taiga, or only Taiga Cloud?**
Both. Just point `TAIGA_BASE_URL` at your own instance.

**Is it safe to give this my Taiga password?**
You don't have to — a Taiga access token (Option A above) is the recommended way, and your password never gets involved at all. If you do use username/password, it's only kept in memory, never written to disk or logged.

**Can it do things I'm not allowed to do in Taiga?**
No. It uses your own Taiga account and is limited to the exact same permissions you already have.

## Contributing / running the tests

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Lint, format check, type-check
pnpm lint
pnpm format
pnpm typecheck

# Run the offline test suite
pnpm test

# Check dependencies for known security issues
pnpm audit

# Run the live test suite against a real Taiga project (see docs/testing.md)
pnpm test:integration
```

See [docs/testing.md](docs/testing.md) for how to set up the live-test project.

## Security

See [SECURITY.md](SECURITY.md) for how to privately report a security problem.

## License

[MIT](LICENSE).
