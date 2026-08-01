/**
 * Stock Taiga has no long-lived personal-access-token concept — the
 * normal flow exchanges username+password for a token with a refresh
 * endpoint. `token` lets a caller inject an already-obtained credential
 * (e.g. from a secrets manager) instead of ever handing this process a
 * password; such a token cannot be auto-refreshed if Taiga rejects it
 * (see AuthSession.refresh).
 */
export type TaigaCredentials =
  | { kind: "password"; username: string; password: string }
  | { kind: "token"; token: string };

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RequestOptions {
  method: HttpMethod;
  path: string;
  query?: Record<string, string | number | boolean | undefined> | undefined;
  body?: unknown;
}
