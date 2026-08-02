import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TaigaClient } from "../../client/taiga-client.js";
import { handleTool } from "../shared/helpers.js";
import { registerCrudTools } from "../shared/resource-crud.js";
import {
  membershipBulkCreateInput,
  membershipCreateInput,
  membershipListInput,
  membershipUpdateInput,
} from "./schema.js";

const BASE_PATH = "/api/v1/memberships";

export function registerMembershipTools(
  server: McpServer,
  client: TaigaClient,
  requireElicitation = false,
): void {
  registerCrudTools({
    server,
    client,
    resource: "membership",
    basePath: BASE_PATH,
    listInput: membershipListInput,
    createInput: membershipCreateInput,
    updateInput: membershipUpdateInput,
    requireElicitation,
  });

  server.registerTool(
    "membership_bulk_create",
    {
      description:
        "Invite multiple members to a project in one call. Each entry " +
        "needs a role id and either a username or an email — this will " +
        "send real invitation emails for entries that don't match an " +
        "existing user.",
      inputSchema: membershipBulkCreateInput,
    },
    async (args) =>
      handleTool("membership_bulk_create", args, () =>
        client.create(`${BASE_PATH}/bulk_create`, args),
      ),
  );

  server.registerTool(
    "membership_resend_invitation",
    {
      description: "Resend a pending project invitation email.",
      inputSchema: { id: z.number().int().describe("Membership id") },
    },
    async (args) =>
      handleTool("membership_resend_invitation", args, () =>
        client.create(`${BASE_PATH}/${String(args.id)}/resend_invitation`, {}),
      ),
  );
}
