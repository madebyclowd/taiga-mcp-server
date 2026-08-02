import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TaigaClient } from "../../client/taiga-client.js";
import { handleTool } from "../shared/helpers.js";
import { refResolveInput } from "./schema.js";

interface ProjectSlugResponse {
  slug: string;
}

interface ResolverResponse {
  project?: number;
  us?: number;
  task?: number;
  issue?: number;
  epic?: number;
}

/** Taiga's resolver response key -> our resource type name. */
const REF_TYPE_BY_KEY: Record<"us" | "task" | "issue" | "epic", string> = {
  us: "user_story",
  task: "task",
  issue: "issue",
  epic: "epic",
};

/**
 * `GET /api/v1/resolver?project=<slug>&ref=<n>` — confirmed live: it
 * always returns `200` (never 404), body has `project` plus whichever
 * of `us`/`task`/`issue`/`epic` matched; a non-matching ref returns
 * just `{ project }` with none of those keys present.
 */
export function registerResolveTools(
  server: McpServer,
  client: TaigaClient,
): void {
  server.registerTool(
    "ref_resolve",
    {
      description:
        'Resolve a project-scoped ref (e.g. "#436" or 436) to its type ' +
        "(issue, user_story, task, or epic) and numeric id, without " +
        "fetching full details.",
      inputSchema: refResolveInput,
    },
    async (args) =>
      handleTool("ref_resolve", args, async () => {
        const slug =
          typeof args.project === "number"
            ? (
                await client.get<ProjectSlugResponse>(
                  `/api/v1/projects/${String(args.project)}`,
                )
              ).slug
            : args.project;
        const ref =
          typeof args.ref === "string" ? args.ref.replace(/^#/, "") : args.ref;

        const result = await client.get<ResolverResponse>("/api/v1/resolver", {
          project: slug,
          ref,
        });

        for (const [key, type] of Object.entries(REF_TYPE_BY_KEY) as Array<
          [keyof typeof REF_TYPE_BY_KEY, string]
        >) {
          const id = result[key];
          if (typeof id === "number") {
            return { type, id, project: result.project };
          }
        }
        throw new Error(
          `Ref not found in project ${slug}: ${String(args.ref)}`,
        );
      }),
  );
}
