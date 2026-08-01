import type { Logger } from "pino";
import {
  TaigaApiError,
  TaigaAuthError,
  TaigaConflictError,
  TaigaRateLimitError,
  TaigaValidationError,
  extractErrorMessage,
  parseValidationErrorBody,
} from "../errors/taiga-error.js";
import type { AuthSession } from "./auth.js";
import type { RequestOptions } from "./types.js";

export interface HttpRequesterOptions {
  baseUrl: string;
  authSession: AuthSession;
  logger: Logger;
  fetchImpl?: typeof fetch | undefined;
  /** Max 429 retry attempts before giving up. Default 3, per ADR-004. */
  maxRateLimitAttempts?: number;
}

export interface HttpRequester {
  request: <T = unknown>(options: RequestOptions) => Promise<T>;
}

/**
 * Central request path for every Taiga call. Owns the two retry
 * behaviors decided in
 * ai-docs/01_architecture/taiga-mcp-adr-004-resilience-and-error-handling.md:
 * reactive 401 (refresh once, retry once) and 429 (bounded exponential
 * backoff, respecting `Retry-After`). No tool implementation should
 * ever need to reimplement either.
 */
export function createHttpRequester(
  options: HttpRequesterOptions,
): HttpRequester {
  const { authSession, logger } = options;
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxRateLimitAttempts = options.maxRateLimitAttempts ?? 3;
  const baseUrl = options.baseUrl.endsWith("/")
    ? options.baseUrl.slice(0, -1)
    : options.baseUrl;

  function buildUrl(path: string, query: RequestOptions["query"]): string {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(`${baseUrl}${normalizedPath}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  async function send(
    reqOptions: RequestOptions,
    token: string,
  ): Promise<Response> {
    const url = buildUrl(reqOptions.path, reqOptions.query);
    const headers: Record<string, string> = {
      authorization: `Bearer ${token}`,
    };
    const init: RequestInit = { method: reqOptions.method, headers };
    if (reqOptions.body !== undefined) {
      headers["content-type"] = "application/json";
      init.body = JSON.stringify(reqOptions.body);
    }
    return fetchImpl(url, init);
  }

  async function request<T = unknown>(reqOptions: RequestOptions): Promise<T> {
    let token = await authSession.getToken();
    let hasRefreshed = false;
    let rateLimitAttempt = 0;

    for (;;) {
      const response = await send(reqOptions, token);

      if (response.status === 401 && !hasRefreshed) {
        hasRefreshed = true;
        logger.warn("taiga http: 401, refreshing token and retrying once");
        token = await authSession.refresh();
        continue;
      }

      if (response.status === 429) {
        if (rateLimitAttempt >= maxRateLimitAttempts) {
          throw new TaigaRateLimitError({
            message: "Taiga rate limit retries exhausted",
            params: reqOptions,
          });
        }
        const delayMs = computeBackoffDelayMs(response, rateLimitAttempt);
        rateLimitAttempt += 1;
        logger.warn(
          { delayMs, attempt: rateLimitAttempt },
          "taiga http: 429, backing off",
        );
        await sleep(delayMs);
        continue;
      }

      if (response.ok) {
        if (response.status === 204) return undefined as T;
        return (await response.json()) as T;
      }

      const body = await safeReadJson(response);
      throw mapError(response.status, body, reqOptions);
    }
  }

  return { request };
}

function computeBackoffDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const asSeconds = Number(retryAfter);
    if (!Number.isNaN(asSeconds)) return asSeconds * 1000;
    const asDate = Date.parse(retryAfter);
    if (!Number.isNaN(asDate)) return Math.max(0, asDate - Date.now());
  }
  return 500 * 2 ** attempt; // 500ms, 1s, 2s
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeReadJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function mapError(
  status: number,
  body: unknown,
  reqOptions: RequestOptions,
): TaigaApiError {
  if (status === 400) {
    return new TaigaValidationError({
      message: extractErrorMessage(body, "Taiga validation error"),
      fields: parseValidationErrorBody(body),
      params: reqOptions,
    });
  }
  if (status === 401) {
    return new TaigaAuthError({
      message: extractErrorMessage(body, "Taiga authentication failed"),
      params: reqOptions,
    });
  }
  if (status === 409) {
    return new TaigaConflictError({
      message: extractErrorMessage(
        body,
        "Taiga optimistic-concurrency conflict",
      ),
      params: reqOptions,
    });
  }
  return new TaigaApiError({
    status,
    message: extractErrorMessage(
      body,
      `Taiga request failed with status ${status}`,
    ),
    params: reqOptions,
  });
}
