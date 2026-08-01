import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TaigaClient } from "../client/taiga-client.js";
import { registerAttachmentTools } from "./attachments.js";
import { registerCommentTools } from "./comments.js";
import { registerEpicTools } from "./epics.js";
import { registerIssueTools } from "./issues.js";
import { registerMembershipTools } from "./memberships.js";
import { registerMilestoneTools } from "./milestones.js";
import { registerProjectTools } from "./projects.js";
import { registerRawRequestTools } from "./raw-request.js";
import { registerSearchTools } from "./search.js";
import { registerTaskTools } from "./tasks.js";
import { registerUserStoryTools } from "./user-stories.js";
import { registerVoteWatchTools } from "./vote-watch.js";
import { registerWikiTools } from "./wiki.js";

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
