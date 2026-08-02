import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TaigaClient } from "../../client/taiga-client.js";
import { handleTool } from "../shared/helpers.js";
import { registerCrudTools } from "../shared/resource-crud.js";
import { wikiCreateInput, wikiListInput, wikiUpdateInput } from "./schema.js";

const BASE_PATH = "/api/v1/wiki";

export function registerWikiTools(
  server: McpServer,
  client: TaigaClient,
  requireElicitation = false,
): void {
  registerCrudTools({
    server,
    client,
    resource: "wiki_page",
    resourceTitle: "Wiki Page",
    basePath: BASE_PATH,
    listInput: wikiListInput,
    createInput: wikiCreateInput,
    updateInput: wikiUpdateInput,
    requireElicitation,
  });

  server.registerTool(
    "wiki_page_get_by_slug",
    {
      description:
        "Get a wiki page by its project-scoped slug instead of its numeric id.",
      inputSchema: {
        project: z.number().int(),
        slug: z.string().min(1),
      },
    },
    async (args) =>
      handleTool("wiki_page_get_by_slug", args, () =>
        client.get(`${BASE_PATH}/by_slug`, args),
      ),
  );
}
