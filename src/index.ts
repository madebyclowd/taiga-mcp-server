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
