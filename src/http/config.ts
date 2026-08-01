export interface HttpServerConfig {
  baseUrl: string;
  port: number;
  /** Unset = reflect any Origin (fine for a locally-hosted/team tool; lock down for internet-facing deployments). */
  allowedOrigins: string[] | undefined;
  sessionTtlMs: number;
}

const DEFAULT_PORT = 3000;
const DEFAULT_SESSION_TTL_MS = 30 * 60 * 1000;

/**
 * Deliberately does **not** read `TAIGA_TOKEN`/`TAIGA_USERNAME`/
 * `TAIGA_PASSWORD` — per
 * ai-docs/01_architecture/taiga-mcp-adr-002-auth-and-credential-handling.md,
 * HTTP mode has no process-wide credential; each session supplies its
 * own via `Authorization: Bearer <taiga-token>`.
 */
export function loadHttpConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): HttpServerConfig {
  const baseUrl = env["TAIGA_BASE_URL"];
  if (!baseUrl) {
    throw new Error(
      "TAIGA_BASE_URL is required (e.g. https://api.taiga.io or your self-hosted instance URL).",
    );
  }

  const port = env["HTTP_PORT"] ? Number(env["HTTP_PORT"]) : DEFAULT_PORT;
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(
      `HTTP_PORT must be a positive integer, got: ${env["HTTP_PORT"]}`,
    );
  }

  const allowedOriginsRaw = env["HTTP_ALLOWED_ORIGINS"];
  const allowedOrigins = allowedOriginsRaw
    ? allowedOriginsRaw
        .split(",")
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0)
    : undefined;

  const sessionTtlMs = env["HTTP_SESSION_TTL_MS"]
    ? Number(env["HTTP_SESSION_TTL_MS"])
    : DEFAULT_SESSION_TTL_MS;
  if (!Number.isInteger(sessionTtlMs) || sessionTtlMs <= 0) {
    throw new Error(
      `HTTP_SESSION_TTL_MS must be a positive integer, got: ${env["HTTP_SESSION_TTL_MS"]}`,
    );
  }

  return { baseUrl, port, allowedOrigins, sessionTtlMs };
}
