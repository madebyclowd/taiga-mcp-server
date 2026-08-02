import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TaigaClient } from "../../client/taiga-client.js";
import { epicCreateInput, epicListInput, epicUpdateInput } from "./schema.js";
import { registerCrudTools } from "../shared/resource-crud.js";
import { handleTool } from "../shared/helpers.js";
import { createAssignmentTransform } from "../shared/member-resolver.js";

const BASE_PATH = "/api/v1/epics";

export function registerEpicTools(
  server: McpServer,
  client: TaigaClient,
  requireElicitation = false,
): void {
  registerCrudTools({
    server,
    client,
    resource: "epic",
    basePath: BASE_PATH,
    listInput: epicListInput,
    createInput: epicCreateInput,
    updateInput: epicUpdateInput,
    requireElicitation,
    transformWriteArgs: createAssignmentTransform(client, async (args) => {
      if (typeof args.project === "number") return args.project;
      const epic = await client.get<{ project: number }>(
        `${BASE_PATH}/${String(args.id)}`,
      );
      return epic.project;
    }),
  });

  server.registerTool(
    "epic_related_user_stories",
    {
      description: "List the user stories linked to an epic.",
      inputSchema: { id: z.number().int().describe("Epic id") },
    },
    async (args) =>
      handleTool("epic_related_user_stories", args, () =>
        client.list(`${BASE_PATH}/${String(args.id)}/related_userstories`),
      ),
  );

  server.registerTool(
    "epic_link_user_story",
    {
      description: "Link an existing user story to an epic.",
      inputSchema: {
        id: z.number().int().describe("Epic id"),
        user_story: z.number().int().describe("User story id to link"),
      },
    },
    async (args) =>
      // Taiga requires `epic` in the body too, even though it's already
      // in the URL path — confirmed live (400 "This field is required."
      // without it) during phase 5 integration testing.
      handleTool("epic_link_user_story", args, () =>
        client.create(`${BASE_PATH}/${String(args.id)}/related_userstories`, {
          epic: args.id,
          user_story: args.user_story,
        }),
      ),
  );

  server.registerTool(
    "epic_unlink_user_story",
    {
      description: "Unlink a user story from an epic.",
      inputSchema: {
        id: z.number().int().describe("Epic id"),
        user_story: z.number().int().describe("User story id to unlink"),
      },
    },
    async (args) =>
      // Trivially reversible (re-link via epic_link_user_story) — not
      // routed through the destructive-confirm gate, matching phase 6's
      // scope decision.
      handleTool("epic_unlink_user_story", args, () =>
        client.delete(
          `${BASE_PATH}/${String(args.id)}/related_userstories/${String(args.user_story)}`,
        ),
      ),
  );
}
