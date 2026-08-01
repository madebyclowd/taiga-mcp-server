import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TaigaClient } from "../../client/taiga-client.js";
import {
  projectCreateInput,
  projectListInput,
  projectUpdateInput,
} from "./schema.js";
import { registerCrudTools } from "../shared/resource-crud.js";

const BASE_PATH = "/api/v1/projects";

export function registerProjectTools(
  server: McpServer,
  client: TaigaClient,
): void {
  registerCrudTools({
    server,
    client,
    resource: "project",
    basePath: BASE_PATH,
    listInput: projectListInput,
    createInput: projectCreateInput,
    updateInput: projectUpdateInput,
  });
}
