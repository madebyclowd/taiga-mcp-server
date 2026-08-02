# Security Policy

`@madebyclowd/taiga-mcp-server` reads and writes your Taiga project data via
your own Taiga credentials. We treat security issues seriously.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report privately via
[GitHub Security Advisories](https://github.com/madebyclowd/taiga-mcp-server/security/advisories/new).
This is also linked from the "New issue" picker.

Include, where possible:

- A description of the vulnerability and its impact.
- Steps to reproduce (which tool/transport, minimal request shape).
- The package version and transport (stdio / HTTP) affected.

We'll acknowledge reports as soon as possible and follow up with a fix
timeline once triaged.

## Supported versions

Only the latest published version on npm is supported. Please upgrade
before reporting an issue that may already be fixed.

## Scope notes

- Credentials (`TAIGA_TOKEN`, `TAIGA_USERNAME`/`PASSWORD`, or an HTTP
  session's bearer token) are held in memory only and never written to
  disk or logs — see
  [ADR: Auth & Credential Handling](ai-docs/01_architecture/taiga-mcp-adr-002-auth-and-credential-handling.md).
- Published releases carry
  [npm provenance attestation](https://docs.npmjs.com/generating-provenance-statements)
  — verify the package was built from this repository via GitHub
  Actions, not a local machine.
