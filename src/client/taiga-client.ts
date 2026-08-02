import type { Logger } from "pino";
import { createLogger } from "../lib/logger.js";
import { TaigaApiError } from "../errors/taiga-error.js";
import { AuthSession } from "./auth.js";
import { createHttpRequester, type HttpRequester } from "./http.js";
import { updateWithVersion, type VersionedResource } from "./occ.js";
import type { RequestOptions, TaigaCredentials } from "./types.js";

/** How long a single attachment byte-fetch may take before aborting. */
const DOWNLOAD_TIMEOUT_MS = 30_000;

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
  private readonly authSession: AuthSession;
  private readonly fetchImpl: typeof fetch;

  constructor(options: TaigaClientOptions) {
    this.logger = options.logger ?? createLogger();
    this.fetchImpl = options.fetchImpl ?? fetch;

    this.authSession = new AuthSession({
      baseUrl: options.baseUrl,
      credentials: options.credentials,
      logger: this.logger,
      fetchImpl: options.fetchImpl,
    });

    this.requester = createHttpRequester({
      baseUrl: options.baseUrl,
      authSession: this.authSession,
      logger: this.logger,
      fetchImpl: options.fetchImpl,
    });
  }

  get<T = unknown>(path: string, query?: RequestOptions["query"]): Promise<T> {
    return this.requester.request<T>({ method: "GET", path, query });
  }

  /** Semantically a collection GET; same request path as `get` today —
   * kept distinct so call sites read as singular-vs-collection intent.
   * Returns the raw parsed body (typically an array), no pagination
   * metadata. Used internally by `member-resolver.ts` for membership
   * resolution, which needs a plain array — every tool-facing list
   * response goes through `listPaginated` instead (see phase 9). */
  list<T = unknown>(path: string, query?: RequestOptions["query"]): Promise<T> {
    return this.requester.request<T>({ method: "GET", path, query });
  }

  /**
   * Collection GET that also surfaces Taiga's `x-pagination-*` response
   * headers, wrapped as `{ items, pagination }`. Every endpoint this is
   * used against was live-confirmed (phase 9) to send these headers —
   * throws if `x-pagination-count` is missing rather than silently
   * guessing a default, since that would mean this method was pointed
   * at an endpoint that isn't actually Taiga-paginated as expected.
   */
  async listPaginated<T = unknown>(
    path: string,
    query?: RequestOptions["query"],
  ): Promise<{
    items: T;
    pagination: { count: number; current_page: number; has_next: boolean };
  }> {
    const { data, response } = await this.requester.requestRaw<T>({
      method: "GET",
      path,
      query,
    });
    const countHeader = response.headers.get("x-pagination-count");
    if (countHeader === null) {
      throw new Error(
        `listPaginated: ${path} did not return an x-pagination-count header — ` +
          "this endpoint is not Taiga-paginated as expected.",
      );
    }
    const currentHeader = response.headers.get("x-pagination-current");
    return {
      items: data,
      pagination: {
        count: Number(countHeader),
        current_page: currentHeader === null ? 1 : Number(currentHeader),
        has_next: response.headers.get("x-pagination-next") !== null,
      },
    };
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

  /**
   * Fetches a binary attachment from its own `url` field. Confirmed
   * live: Taiga Cloud's attachment URLs are pre-signed
   * (`media-protected.taiga.io/...?token=...`) and work with **no**
   * `Authorization` header at all; the header is still attached anyway
   * as a harmless no-op there and a real requirement on setups where
   * the URL happens to be same-host with the API (e.g. the docs' own
   * localhost dev example). Deliberately not routed through
   * `HttpRequester` — the response isn't JSON.
   */
  async downloadBinary(
    url: string,
  ): Promise<{ bytes: Buffer; contentType: string | null }> {
    const token = await this.authSession.getToken();
    const response = await this.fetchImpl(url, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new TaigaApiError({
        status: response.status,
        message: `Attachment download failed with status ${String(response.status)}`,
      });
    }
    const arrayBuffer = await response.arrayBuffer();
    return {
      bytes: Buffer.from(arrayBuffer),
      contentType: response.headers.get("content-type"),
    };
  }
}
