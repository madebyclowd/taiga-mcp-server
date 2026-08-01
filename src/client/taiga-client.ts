import type { Logger } from "pino";
import { createLogger } from "../lib/logger.js";
import { AuthSession } from "./auth.js";
import { createHttpRequester, type HttpRequester } from "./http.js";
import { updateWithVersion, type VersionedResource } from "./occ.js";
import type { RequestOptions, TaigaCredentials } from "./types.js";

export interface TaigaClientOptions {
  baseUrl: string;
  credentials: TaigaCredentials;
  logger?: Logger | undefined;
  fetchImpl?: typeof fetch | undefined;
}

/**
 * Single entry point every tool (phase 2+) calls into. Composes auth,
 * retry/backoff, OCC, and structured-error mapping so no individual
 * tool has to reimplement any of Taiga's quirks — see
 * ai-docs/02_planning/taiga-mcp-plan-01-foundation-and-core-client.md.
 */
export class TaigaClient {
  readonly logger: Logger;
  private readonly requester: HttpRequester;

  constructor(options: TaigaClientOptions) {
    this.logger = options.logger ?? createLogger();

    const authSession = new AuthSession({
      baseUrl: options.baseUrl,
      credentials: options.credentials,
      logger: this.logger,
      fetchImpl: options.fetchImpl,
    });

    this.requester = createHttpRequester({
      baseUrl: options.baseUrl,
      authSession,
      logger: this.logger,
      fetchImpl: options.fetchImpl,
    });
  }

  get<T = unknown>(path: string, query?: RequestOptions["query"]): Promise<T> {
    return this.requester.request<T>({ method: "GET", path, query });
  }

  /** Semantically a collection GET; same request path as `get` today —
   * kept distinct so call sites read as singular-vs-collection intent. */
  list<T = unknown>(path: string, query?: RequestOptions["query"]): Promise<T> {
    return this.requester.request<T>({ method: "GET", path, query });
  }

  create<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.requester.request<T>({ method: "POST", path, body });
  }

  /** OCC-safe update — see ./occ.ts for the fetch-then-patch/retry-on-409 behavior. */
  updateWithVersion<T extends VersionedResource = VersionedResource>(
    path: string,
    patch: Record<string, unknown>,
  ): Promise<T> {
    return updateWithVersion<T>(this.requester, path, patch);
  }

  delete(path: string): Promise<void> {
    return this.requester.request<void>({ method: "DELETE", path });
  }

  /** Escape hatch (phase 3's raw-request tool) — same requester, so the
   * same auth/retry/OCC/logging behavior applies; nothing bypasses it. */
  request<T = unknown>(options: RequestOptions): Promise<T> {
    return this.requester.request<T>(options);
  }
}
