import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TaigaClient } from "../../client/taiga-client.js";
import { epicCreateInput, epicListInput, epicUpdateInput } from "./schema.js";
import { registerCrudTools } from "../shared/resource-crud.js";
import { handleTool } from "../shared/helpers.js";

const BASE_PATH = "/api/v1/epics";

export function registerEpicTools(
  server: McpServer,
  client: TaigaClient,
): void {
  registerCrudTools({
    server,
    client,
    resource: "epic",
    basePath: BASE_PATH,
    listInput: epicListInput,
    createInput: epicCreateInput,
    updateInput: epicUpdateInput,
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
      handleTool("epic_link_user_story", args, () =>
        client.create(`${BASE_PATH}/${String(args.id)}/related_userstories`, {
          user_story: args.user_story,
        }),
      ),
  );
}
