import { TaigaConflictError } from "../errors/taiga-error.js";
import type { HttpRequester } from "./http.js";

export interface VersionedResource {
  version: number;
  [key: string]: unknown;
}

/**
 * Taiga requires a `version` field on every PATCH/PUT or it 409s
 * (optimistic concurrency control). Transparent to callers per
 * ai-docs/01_architecture/taiga-mcp-adr-004-resilience-and-error-handling.md:
 * fetch the resource, read its current `version`, PATCH with it; on a
 * 409 (lost the race), re-fetch once and retry the PATCH once.
 *
 * The GET-then-PATCH pair is not atomic — a race window exists between
 * the two calls. Accepted tradeoff: agents are not expected to run
 * tight concurrent edits against the same resource, and the 409 retry
 * covers the case where they do.
 */
export async function updateWithVersion<
  T extends VersionedResource = VersionedResource,
>(
  requester: HttpRequester,
  path: string,
  patch: Record<string, unknown>,
): Promise<T> {
  const current = await requester.request<VersionedResource>({
    method: "GET",
    path,
  });

  try {
    return await requester.request<T>({
      method: "PATCH",
      path,
      body: { ...patch, version: current.version },
    });
  } catch (error) {
    if (!(error instanceof TaigaConflictError)) throw error;

    const fresh = await requester.request<VersionedResource>({
      method: "GET",
      path,
    });
    return requester.request<T>({
      method: "PATCH",
      path,
      body: { ...patch, version: fresh.version },
    });
  }
}
