import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TaigaClient } from "../client/taiga-client.js";
import { registerAttachmentTools } from "./attachments/tool.js";
import { registerCommentTools } from "./comments/tool.js";
import { registerEpicTools } from "./epics/tool.js";
import { registerIssueTools } from "./issues/tool.js";
import { registerMembershipTools } from "./memberships/tool.js";
import { registerMilestoneTools } from "./milestones/tool.js";
import { registerProjectTools } from "./projects/tool.js";
import { registerRawRequestTools } from "./raw-request/tool.js";
import { registerSearchTools } from "./search/tool.js";
import { registerTaskTools } from "./tasks/tool.js";
import { registerUserStoryTools } from "./user-stories/tool.js";
import { registerVoteWatchTools } from "./vote-watch/tool.js";
import { registerWikiTools } from "./wiki/tool.js";

export function registerTools(server: McpServer, client: TaigaClient): void {
  registerProjectTools(server, client);
  registerEpicTools(server, client);
  registerUserStoryTools(server, client);
  registerTaskTools(server, client);
  registerIssueTools(server, client);
  registerMilestoneTools(server, client);
  registerWikiTools(server, client);
  registerMembershipTools(server, client);
  registerCommentTools(server, client);
  registerAttachmentTools(server, client);
  registerVoteWatchTools(server, client);
  registerSearchTools(server, client);
  registerRawRequestTools(server, client);
}
