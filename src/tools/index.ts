import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TaigaClient } from "../client/taiga-client.js";
import { registerEpicTools } from "./epics.js";
import { registerIssueTools } from "./issues.js";
import { registerProjectTools } from "./projects.js";
import { registerTaskTools } from "./tasks.js";
import { registerUserStoryTools } from "./user-stories.js";

export function registerTools(server: McpServer, client: TaigaClient): void {
  registerProjectTools(server, client);
  registerEpicTools(server, client);
  registerUserStoryTools(server, client);
  registerTaskTools(server, client);
  registerIssueTools(server, client);
}
