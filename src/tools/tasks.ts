import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TaigaClient } from "../client/taiga-client.js";
import {
  taskCreateInput,
  taskListInput,
  taskUpdateInput,
} from "./schemas/task.js";
import { registerCrudTools } from "./resource-crud.js";

const BASE_PATH = "/api/v1/tasks";

export function registerTaskTools(
  server: McpServer,
  client: TaigaClient,
): void {
  registerCrudTools({
    server,
    client,
    resource: "task",
    basePath: BASE_PATH,
    listInput: taskListInput,
    createInput: taskCreateInput,
    updateInput: taskUpdateInput,
  });
}
