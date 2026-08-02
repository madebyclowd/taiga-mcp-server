import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TaigaClient } from "../../client/taiga-client.js";
import { handleTool } from "../shared/helpers.js";
import { registerCrudTools } from "../shared/resource-crud.js";
import {
  milestoneCreateInput,
  milestoneListInput,
  milestoneUpdateInput,
} from "./schema.js";

const BASE_PATH = "/api/v1/milestones";

export function registerMilestoneTools(
  server: McpServer,
  client: TaigaClient,
  requireElicitation = false,
): void {
  registerCrudTools({
    server,
    client,
    resource: "milestone",
    resourceTitle: "Milestone",
    basePath: BASE_PATH,
    listInput: milestoneListInput,
    createInput: milestoneCreateInput,
    updateInput: milestoneUpdateInput,
    requireElicitation,
  });

  server.registerTool(
    "milestone_stats",
    {
      description:
        "Get burndown/points stats for a milestone (sprint): total and " +
        "completed points, user stories, tasks, and per-day breakdown.",
      inputSchema: { id: z.number().int().describe("Milestone id") },
    },
    async (args) =>
      handleTool("milestone_stats", args, () =>
        client.get(`${BASE_PATH}/${String(args.id)}/stats`),
      ),
  );
}
