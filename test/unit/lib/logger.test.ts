import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { TaigaApiError } from "../../../src/errors/taiga-error.js";
import { createLogger } from "../../../src/lib/logger.js";

function captureStream(): { stream: Writable; output: () => string } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _enc, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  return { stream, output: () => chunks.join("") };
}

describe("createLogger", () => {
  it("redacts passwords, tokens, refresh tokens, and auth headers", () => {
    const { stream, output } = captureStream();
    const logger = createLogger({ level: "info", destination: stream });

    logger.info(
      {
        password: "hunter2",
        token: "abc123",
        refreshToken: "def456",
        headers: { authorization: "Bearer secret-token" },
      },
      "test event",
    );

    const logged = output();
    expect(logged).not.toContain("hunter2");
    expect(logged).not.toContain("abc123");
    expect(logged).not.toContain("def456");
    expect(logged).not.toContain("secret-token");
    expect(logged).toContain("[REDACTED]");
  });

  it("redacts nested config-style auth headers too", () => {
    const { stream, output } = captureStream();
    const logger = createLogger({ level: "info", destination: stream });

    logger.error(
      { config: { headers: { Authorization: "Bearer leaked" } } },
      "request failed",
    );

    expect(output()).not.toContain("leaked");
  });

  it("redacts a TaigaApiError's request body/query when logged under `err`", () => {
    // Regression test: pino's default `err` serializer copies every
    // own-enumerable property of a logged Error — including
    // TaigaApiError.params (the failed request's method/path/query/body)
    // — so a secret the caller passed through (e.g. via the raw-request
    // escape hatch) must still be redacted at that nesting, not just at
    // the top level. See src/lib/logger.ts's REDACT_PATHS comment.
    const { stream, output } = captureStream();
    const logger = createLogger({ level: "info", destination: stream });

    const error = new TaigaApiError({
      status: 400,
      message: "Taiga request failed",
      params: {
        method: "POST",
        path: "/api/v1/webhooks",
        query: { token: "query-secret" },
        body: { name: "hook", secret: "body-secret" },
      },
    });

    logger.error({ err: error }, "request failed");

    const logged = output();
    expect(logged).not.toContain("query-secret");
    expect(logged).not.toContain("body-secret");
    expect(logged).toContain("[REDACTED]");
  });

  it("defaults level to info when LOG_LEVEL is unset", () => {
    const { stream } = captureStream();
    const logger = createLogger({ destination: stream });
    expect(logger.level).toBe("info");
  });

  it("honors an explicit level override", () => {
    const { stream } = captureStream();
    const logger = createLogger({ level: "debug", destination: stream });
    expect(logger.level).toBe("debug");
  });
});
