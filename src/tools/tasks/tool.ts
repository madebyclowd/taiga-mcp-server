import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TaigaClient } from "../../client/taiga-client.js";
import { taskCreateInput, taskListInput, taskUpdateInput } from "./schema.js";
import { registerCrudTools } from "../shared/resource-crud.js";
import { createAssignmentTransform } from "../shared/member-resolver.js";

const BASE_PATH = "/api/v1/tasks";

export function registerTaskTools(
  server: McpServer,
  client: TaigaClient,
  requireElicitation = false,
): void {
  registerCrudTools({
    server,
    client,
    resource: "task",
    basePath: BASE_PATH,
    listInput: taskListInput,
    createInput: taskCreateInput,
    updateInput: taskUpdateInput,
    requireElicitation,
    transformWriteArgs: createAssignmentTransform(client, async (args) => {
      if (typeof args.project === "number") return args.project;
      const task = await client.get<{ project: number }>(
        `${BASE_PATH}/${String(args.id)}`,
      );
      return task.project;
    }),
  });
}
