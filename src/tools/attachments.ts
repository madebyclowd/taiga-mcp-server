import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TaigaClient } from "../client/taiga-client.js";
import { handleTool } from "./helpers.js";
import { RESOURCE_REGISTRY } from "./resource-registry.js";
import {
  attachmentDeleteInput,
  attachmentListInput,
  attachmentUploadInput,
} from "./schemas/attachment.js";

/**
 * Confirmed live against a real Taiga instance: uploads are
 * `multipart/form-data` with `project`, `object_id`, and
 * `attached_file` fields at `{basePath}/attachments`; listing filters
 * the same collection by `object_id`. Input takes base64 rather than a
 * raw binary because MCP tool arguments are JSON.
 */
export function registerAttachmentTools(
  server: McpServer,
  client: TaigaClient,
): void {
  server.registerTool(
    "attachment_upload",
    {
      description:
        "Upload a file attachment to an epic, user story, task, issue, " +
        "or wiki page. File contents are passed as base64.",
      inputSchema: attachmentUploadInput,
    },
    async (args) => {
      const entry = RESOURCE_REGISTRY[args.resource];
      return handleTool("attachment_upload", args, () => {
        const form = new FormData();
        form.append("project", String(args.project));
        form.append("object_id", String(args.object_id));
        if (args.description !== undefined) {
          form.append("description", args.description);
        }
        const bytes = Buffer.from(args.file_base64, "base64");
        form.append(
          "attached_file",
          new Blob([bytes], {
            type: args.content_type ?? "application/octet-stream",
          }),
          args.file_name,
        );
        return client.create(`${entry.basePath}/attachments`, form);
      });
    },
  );

  server.registerTool(
    "attachment_list",
    {
      description:
        "List attachments on an epic, user story, task, issue, or wiki page.",
      inputSchema: attachmentListInput,
    },
    async (args) => {
      const entry = RESOURCE_REGISTRY[args.resource];
      return handleTool("attachment_list", args, () =>
        client.list(`${entry.basePath}/attachments`, {
          object_id: args.object_id,
        }),
      );
    },
  );

  server.registerTool(
    "attachment_delete",
    {
      description: "Delete an attachment by id. This cannot be undone.",
      inputSchema: attachmentDeleteInput,
    },
    async (args) => {
      const entry = RESOURCE_REGISTRY[args.resource];
      return handleTool("attachment_delete", args, () =>
        client.delete(`${entry.basePath}/attachments/${String(args.id)}`),
      );
    },
  );
}
