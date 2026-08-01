import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TaigaClient } from "../client/taiga-client.js";
import {
  issueClassificationInput,
  issueCreateInput,
  issueListInput,
  issueUpdateInput,
} from "./schemas/issue.js";
import { registerCrudTools } from "./resource-crud.js";
import { handleTool } from "./helpers.js";

const BASE_PATH = "/api/v1/issues";

export function registerIssueTools(
  server: McpServer,
  client: TaigaClient,
): void {
  registerCrudTools({
    server,
    client,
    resource: "issue",
    basePath: BASE_PATH,
    listInput: issueListInput,
    createInput: issueCreateInput,
    updateInput: issueUpdateInput,
  });

  server.registerTool(
    "issue_set_classification",
    {
      description:
        "Set an issue's type/status/priority/severity in one call " +
        "(only the fields provided are changed). Convenience wrapper " +
        "over issue_update for this common triage action.",
      inputSchema: issueClassificationInput,
    },
    async (args) => {
      const { id, ...patch } = args;
      return handleTool("issue_set_classification", args, () =>
        client.updateWithVersion(`${BASE_PATH}/${String(id)}`, patch),
      );
    },
  );
}
