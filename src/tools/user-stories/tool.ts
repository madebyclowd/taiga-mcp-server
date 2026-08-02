import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TaigaClient } from "../../client/taiga-client.js";
import {
  userStoryCreateInput,
  userStoryListInput,
  userStoryUpdateInput,
} from "./schema.js";
import { registerCrudTools } from "../shared/resource-crud.js";
import { handleTool } from "../shared/helpers.js";

const BASE_PATH = "/api/v1/userstories";

export function registerUserStoryTools(
  server: McpServer,
  client: TaigaClient,
  requireElicitation = false,
): void {
  registerCrudTools({
    server,
    client,
    resource: "user_story",
    basePath: BASE_PATH,
    listInput: userStoryListInput,
    createInput: userStoryCreateInput,
    updateInput: userStoryUpdateInput,
    requireElicitation,
  });

  server.registerTool(
    "user_story_assign_milestone",
    {
      description:
        "Move a user story into a milestone/sprint (or out of one, by " +
        "omitting milestone). Convenience wrapper over user_story_update.",
      inputSchema: {
        id: z.number().int().describe("User story id"),
        milestone: z
          .number()
          .int()
          .optional()
          .describe(
            "Milestone id, or omit to remove the story from its milestone",
          ),
      },
    },
    async (args) => {
      const { id, ...patch } = args;
      return handleTool("user_story_assign_milestone", args, () =>
        client.updateWithVersion(`${BASE_PATH}/${String(id)}`, patch),
      );
    },
  );
}
