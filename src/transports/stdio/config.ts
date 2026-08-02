import type { TaigaCredentials } from "../../client/types.js";
import { parseBooleanEnv } from "../shared/config.js";

export interface ServerConfig {
  baseUrl: string;
  credentials: TaigaCredentials;
  requireElicitation: boolean;
}

/**
 * Single credential for the process lifetime — correct trust boundary
 * for the stdio transport (a locally-spawned, single-user process).
 * See ai-docs/01_architecture/taiga-mcp-adr-002-auth-and-credential-handling.md.
 */
export function loadConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ServerConfig {
  const baseUrl = env["TAIGA_BASE_URL"];
  if (!baseUrl) {
    throw new Error(
      "TAIGA_BASE_URL is required (e.g. https://api.taiga.io or your self-hosted instance URL).",
    );
  }

  const requireElicitation = parseBooleanEnv(env["TAIGA_REQUIRE_ELICITATION"]);

  const token = env["TAIGA_TOKEN"];
  if (token) {
    return {
      baseUrl,
      credentials: { kind: "token", token },
      requireElicitation,
    };
  }

  const username = env["TAIGA_USERNAME"];
  const password = env["TAIGA_PASSWORD"];
  if (username && password) {
    return {
      baseUrl,
      credentials: { kind: "password", username, password },
      requireElicitation,
    };
  }

  throw new Error(
    "Set TAIGA_TOKEN, or both TAIGA_USERNAME and TAIGA_PASSWORD.",
  );
}
