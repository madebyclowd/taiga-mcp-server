import { createServer as createNodeHttpServer, type Server } from "node:http";
import type { Logger } from "pino";
import { createHttpApp, type HttpApp } from "./http/app.js";
import { loadHttpConfigFromEnv } from "./http/config.js";
import { createLogger } from "./lib/logger.js";

const REQUEST_TIMEOUT_MS = 30_000;
const HEADERS_TIMEOUT_MS = 35_000;

export function createHttpServer(app: HttpApp, logger: Logger): Server {
  const server = createNodeHttpServer((req, res) => {
    app.handler(req, res).catch((error: unknown) => {
      logger.error(
        { err: error },
        "server-taiga (http): unhandled request error",
      );
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json" });
      }
      res.end(JSON.stringify({ error: "Internal server error" }));
    });
  });
  server.requestTimeout = REQUEST_TIMEOUT_MS;
  server.headersTimeout = HEADERS_TIMEOUT_MS;
  return server;
}

export async function main(): Promise<void> {
  const logger = createLogger();
  try {
    const config = loadHttpConfigFromEnv();
    const app = createHttpApp({
      baseUrl: config.baseUrl,
      sessionTtlMs: config.sessionTtlMs,
      allowedOrigins: config.allowedOrigins,
      logger,
    });
    const server = createHttpServer(app, logger);

    await new Promise<void>((resolve) => {
      server.listen(config.port, () => {
        logger.info({ port: config.port }, "server-taiga (http) listening");
        resolve();
      });
    });

    const shutdown = (): void => {
      app.sessions.stop();
      server.close(() => process.exit(0));
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (error) {
    logger.error({ err: error }, "server-taiga (http) failed to start");
    process.exitCode = 1;
  }
}
