import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TaigaClient } from "../client/taiga-client.js";
import { registerAttachmentTools } from "./attachments/tool.js";
import { registerBatchTools } from "./batch/tool.js";
import { registerCommentTools } from "./comments/tool.js";
import { registerEpicTools } from "./epics/tool.js";
import { registerFiltersDataTools } from "./filters-data/tool.js";
import { registerIssueTools } from "./issues/tool.js";
import { registerMembershipTools } from "./memberships/tool.js";
import { registerMilestoneTools } from "./milestones/tool.js";
import { registerProjectTools } from "./projects/tool.js";
import { registerRawRequestTools } from "./raw-request/tool.js";
import { registerResolveTools } from "./resolve/tool.js";
import { registerSearchTools } from "./search/tool.js";
import { registerTaskTools } from "./tasks/tool.js";
import { registerUserStoryTools } from "./user-stories/tool.js";
import { registerVoteWatchTools } from "./vote-watch/tool.js";
import { registerWikiTools } from "./wiki/tool.js";

export function registerTools(
  server: McpServer,
  client: TaigaClient,
  requireElicitation = false,
): void {
  registerProjectTools(server, client, requireElicitation);
  registerEpicTools(server, client, requireElicitation);
  registerUserStoryTools(server, client, requireElicitation);
  registerTaskTools(server, client, requireElicitation);
  registerIssueTools(server, client, requireElicitation);
  registerMilestoneTools(server, client, requireElicitation);
  registerWikiTools(server, client, requireElicitation);
  registerMembershipTools(server, client, requireElicitation);
  registerCommentTools(server, client, requireElicitation);
  registerAttachmentTools(server, client, requireElicitation);
  registerVoteWatchTools(server, client);
  registerSearchTools(server, client);
  registerRawRequestTools(server, client);
  registerResolveTools(server, client);
  registerBatchTools(server, client);
  registerFiltersDataTools(server, client);
}
