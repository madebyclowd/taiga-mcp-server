export { TaigaClient, type TaigaClientOptions } from "./client/taiga-client.js";
export type {
  HttpMethod,
  RequestOptions,
  TaigaCredentials,
} from "./client/types.js";
export type { VersionedResource } from "./client/occ.js";
export {
  TaigaApiError,
  TaigaAuthError,
  TaigaConflictError,
  TaigaRateLimitError,
  TaigaValidationError,
  type StructuredTaigaError,
  type TaigaFieldError,
} from "./errors/taiga-error.js";
export { createLogger, type CreateLoggerOptions } from "./lib/logger.js";
export { createServer } from "./server.js";
export { registerTools } from "./tools/index.js";
export {
  loadConfigFromEnv,
  type ServerConfig,
} from "./transports/stdio/config.js";
export { main } from "./transports/stdio/main.js";
export {
  loadHttpConfigFromEnv,
  type HttpServerConfig,
} from "./transports/http/config.js";
export {
  createHttpApp,
  type HttpApp,
  type HttpAppOptions,
} from "./transports/http/app.js";
export { SessionManager, type HttpSession } from "./transports/http/session.js";
export { createHttpServer, main as mainHttp } from "./transports/http/main.js";
