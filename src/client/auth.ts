import type { Logger } from "pino";
import { TaigaAuthError } from "../errors/taiga-error.js";
import type { TaigaCredentials } from "./types.js";

interface TaigaAuthResponse {
  auth_token: string;
  refresh: string;
}

export interface AuthSessionOptions {
  baseUrl: string;
  credentials: TaigaCredentials;
  logger: Logger;
  fetchImpl?: typeof fetch | undefined;
}

/**
 * Owns credential exchange and refresh. In-memory only — never writes
 * a credential or token to disk, per
 * ai-docs/01_architecture/taiga-mcp-adr-002-auth-and-credential-handling.md.
 *
 * Refresh is reactive (called by the HTTP layer on 401), not a
 * background timer — see the same ADR for why: no scheduler, no
 * clock-skew edge case to get wrong.
 */
export class AuthSession {
  private readonly baseUrl: string;
  private readonly credentials: TaigaCredentials;
  private readonly logger: Logger;
  private readonly fetchImpl: typeof fetch;

  private token: string | undefined;
  private refreshTokenValue: string | undefined;
  private exchangeInFlight: Promise<string> | undefined;

  constructor(options: AuthSessionOptions) {
    this.baseUrl = options.baseUrl;
    this.credentials = options.credentials;
    this.logger = options.logger;
    this.fetchImpl = options.fetchImpl ?? fetch;

    if (this.credentials.kind === "token") {
      this.token = this.credentials.token;
    }
  }

  /** Valid token, performing the initial exchange lazily on first call. */
  async getToken(): Promise<string> {
    if (this.token) return this.token;
    return this.exchange();
  }

  private async exchange(): Promise<string> {
    const credentials = this.credentials;

    if (credentials.kind === "token") {
      this.token = credentials.token;
      return this.token;
    }

    // Concurrent callers (e.g. several tool calls firing before the
    // first exchange resolves) join the same in-flight request instead
    // of each triggering their own login call.
    if (this.exchangeInFlight) return this.exchangeInFlight;

    this.exchangeInFlight = (async () => {
      this.logger.debug("taiga auth: exchanging credentials");

      const response = await this.fetchImpl(`${this.baseUrl}/api/v1/auth`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "normal",
          username: credentials.username,
          password: credentials.password,
        }),
      });

      if (!response.ok) {
        throw new TaigaAuthError({
          message: `Taiga login failed with status ${response.status}`,
        });
      }

      const body = (await response.json()) as TaigaAuthResponse;
      this.token = body.auth_token;
      this.refreshTokenValue = body.refresh;
      return this.token;
    })();

    try {
      return await this.exchangeInFlight;
    } finally {
      this.exchangeInFlight = undefined;
    }
  }

  /** Called by the HTTP layer on 401 — refreshes once, does not loop. */
  async refresh(): Promise<string> {
    if (this.credentials.kind === "token") {
      throw new TaigaAuthError({
        message:
          "The manually supplied TAIGA_TOKEN was rejected and cannot be refreshed automatically.",
      });
    }

    if (!this.refreshTokenValue) {
      // Never successfully exchanged yet — fall back to a full exchange.
      this.token = undefined;
      return this.exchange();
    }

    this.logger.debug("taiga auth: refreshing token");

    const response = await this.fetchImpl(
      `${this.baseUrl}/api/v1/auth/refresh`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refresh: this.refreshTokenValue }),
      },
    );

    if (!response.ok) {
      // Refresh token itself expired/revoked — fall back to a full
      // re-exchange rather than surfacing an error immediately.
      this.token = undefined;
      this.refreshTokenValue = undefined;
      return this.exchange();
    }

    const body = (await response.json()) as TaigaAuthResponse;
    this.token = body.auth_token;
    this.refreshTokenValue = body.refresh;
    return this.token;
  }
}
