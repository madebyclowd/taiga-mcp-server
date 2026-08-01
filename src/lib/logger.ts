import pino, { type Logger } from "pino";

/**
 * Paths redacted from every log line, including error/exception paths.
 * fast-redact (pino's redaction engine) has no arbitrary-depth wildcard,
 * so each field is listed both top-level and one level nested — that
 * covers everything this codebase logs directly (credentials passed to
 * `logger.info({ password, token, ... })`, or a caught HTTP error
 * object's `headers`/`config.headers`) without pretending to catch
 * every conceivable nesting depth.
 */
const REDACT_PATHS = [
  "password",
  "*.password",
  "token",
  "*.token",
  "refreshToken",
  "*.refreshToken",
  "authToken",
  "*.authToken",
  "taigaToken",
  "*.taigaToken",
  "taigaPassword",
  "*.taigaPassword",
  "headers.authorization",
  "headers.Authorization",
  "*.headers.authorization",
  "*.headers.Authorization",
  "config.headers.authorization",
  "config.headers.Authorization",
  "*.config.headers.authorization",
  "*.config.headers.Authorization",
  // `TaigaApiError.params` (the failed request's method/path/query/body)
  // is copied wholesale into `err.*` by pino's default `err` serializer
  // (it spreads every own-enumerable property of a logged Error) any
  // time one is logged via `logger.error({ err }, ...)` — every call
  // site does this (see server.ts/server-http.ts). `body`/`query` can
  // carry the same caller-supplied secrets the top-level paths above
  // target (e.g. a webhook secret passed through the raw-request escape
  // hatch), so they need redacting at this exact nesting too — fast-redact
  // has no arbitrary-depth wildcard.
  "err.params.body",
  "err.params.query",
];

export interface CreateLoggerOptions {
  level?: string;
  /**
   * Testing hook only. Production code must never override this away
   * from stderr — see the stdio-safety note below.
   */
  destination?: pino.DestinationStream;
}

/**
 * stderr-only, always. On the stdio MCP transport, stdout is the
 * JSON-RPC wire — any write there (a bare console.log, a library
 * defaulting to stdout) corrupts the protocol stream. Routing every
 * logger through this factory, with no stdout-writing branch at all,
 * makes that bug class structurally impossible rather than just
 * disciplined-against.
 */
export function createLogger(options: CreateLoggerOptions = {}): Logger {
  const level = options.level ?? process.env["LOG_LEVEL"] ?? "info";
  const destination =
    options.destination ?? pino.destination({ fd: 2, sync: false });

  return pino(
    {
      level,
      redact: {
        paths: REDACT_PATHS,
        censor: "[REDACTED]",
      },
    },
    destination,
  );
}
