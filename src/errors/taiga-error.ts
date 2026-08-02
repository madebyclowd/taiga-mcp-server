/**
 * Structured error model for everything that can go wrong talking to
 * Taiga. Deliberately never collapses into a plain string: an MCP tool
 * handler passes `.toStructured()` straight into the tool's error
 * result so the calling agent can see exactly which field/constraint
 * failed and self-correct, instead of retrying blindly against a
 * generic "Bad Request" message.
 */

export interface TaigaFieldError {
  field: string;
  messages: string[];
}

export interface StructuredTaigaError {
  status: number;
  message: string;
  fields: TaigaFieldError[];
  tool?: string | undefined;
  params?: unknown;
}

export interface TaigaApiErrorOptions {
  status: number;
  message: string;
  fields?: TaigaFieldError[];
  tool?: string;
  params?: unknown;
  cause?: unknown;
}

export class TaigaApiError extends Error {
  readonly status: number;
  readonly fields: TaigaFieldError[];
  readonly tool: string | undefined;
  readonly params: unknown;

  constructor(options: TaigaApiErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = "TaigaApiError";
    this.status = options.status;
    this.fields = options.fields ?? [];
    this.tool = options.tool;
    this.params = options.params;
  }

  toStructured(): StructuredTaigaError {
    return {
      status: this.status,
      message: this.message,
      fields: this.fields,
      tool: this.tool,
      params: this.params,
    };
  }
}

/** 401 — credentials rejected or refresh failed. */
export class TaigaAuthError extends TaigaApiError {
  constructor(options: Omit<TaigaApiErrorOptions, "status">) {
    super({ ...options, status: 401 });
    this.name = "TaigaAuthError";
  }
}

/** 429 — throttled, retries exhausted. */
export class TaigaRateLimitError extends TaigaApiError {
  constructor(options: Omit<TaigaApiErrorOptions, "status">) {
    super({ ...options, status: 429 });
    this.name = "TaigaRateLimitError";
  }
}

/** 409 — optimistic-concurrency conflict, retry exhausted. */
export class TaigaConflictError extends TaigaApiError {
  constructor(options: Omit<TaigaApiErrorOptions, "status">) {
    super({ ...options, status: 409 });
    this.name = "TaigaConflictError";
  }
}

/** 400 — field-level validation failure. */
export class TaigaValidationError extends TaigaApiError {
  constructor(options: Omit<TaigaApiErrorOptions, "status">) {
    super({ ...options, status: 400 });
    this.name = "TaigaValidationError";
  }
}

/**
 * Taiga's 400 bodies are shaped like
 * `{"subject": ["This field is required."], "_error_message": "..."}` —
 * per-field keys map to arrays of message strings; keys prefixed with
 * `_` are response metadata, not fields.
 */
export function parseValidationErrorBody(body: unknown): TaigaFieldError[] {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return [];
  }

  const fields: TaigaFieldError[] = [];
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (key.startsWith("_")) continue;
    if (Array.isArray(value)) {
      fields.push({ field: key, messages: value.map((v) => String(v)) });
    }
  }
  return fields;
}

/**
 * Taiga's OCC version-conflict 400 body is a distinct shape from a
 * normal field-validation 400: a bare `version` key holding a plain
 * string (not the usual message-array), e.g.
 * `{"version": "The version doesn't match with the current one"}` —
 * confirmed live against the real API. `version` is a reserved
 * system field on every OCC-versioned resource, never a real business
 * field, so its presence here reliably distinguishes a conflict from
 * an ordinary validation error.
 */
export function isOccConflictBody(body: unknown): boolean {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return false;
  }
  return "version" in (body as Record<string, unknown>);
}

/**
 * Best-effort human-readable message from a Taiga error body, for the
 * `message` field of the structured error — the `fields` array remains
 * the source of truth for programmatic handling.
 */
export function extractErrorMessage(body: unknown, fallback: string): string {
  if (body !== null && typeof body === "object" && !Array.isArray(body)) {
    const record = body as Record<string, unknown>;
    const errorMessage = record["_error_message"];
    if (typeof errorMessage === "string" && errorMessage.length > 0) {
      return errorMessage;
    }
  }
  return fallback;
}
