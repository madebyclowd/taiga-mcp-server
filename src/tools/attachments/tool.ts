import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TaigaApiError } from "../../errors/taiga-error.js";
import type { TaigaClient } from "../../client/taiga-client.js";
import { confirmDestructiveOp } from "../shared/destructive-confirm.js";
import { handleTool } from "../shared/helpers.js";
import { RESOURCE_REGISTRY } from "../shared/resource-registry.js";
import {
  attachmentDeleteInput,
  attachmentDownloadInput,
  attachmentListInput,
  attachmentUploadInput,
} from "./schema.js";

/** Reject downloads above this before ever fetching the bytes. */
const MAX_ATTACHMENT_DOWNLOAD_BYTES = 10 * 1024 * 1024; // 10 MiB

interface AttachmentMeta {
  url: string;
  size: number;
  name: string;
  sha1: string;
}

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
  requireElicitation = false,
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
    "attachment_download",
    {
      description:
        "Download an attachment's file contents as base64, along with " +
        `its filename, content type, size, and sha1. Rejects files ` +
        `larger than ${String(MAX_ATTACHMENT_DOWNLOAD_BYTES)} bytes ` +
        "before downloading.",
      inputSchema: attachmentDownloadInput,
    },
    async (args) => {
      const entry = RESOURCE_REGISTRY[args.resource];
      const basePath = `${entry.basePath}/attachments`;
      return handleTool("attachment_download", args, async () => {
        const attachment = await client.get<AttachmentMeta>(
          `${basePath}/${String(args.id)}`,
        );
        if (attachment.size > MAX_ATTACHMENT_DOWNLOAD_BYTES) {
          throw new TaigaApiError({
            status: 413,
            message:
              `Attachment ${String(args.id)} is ${String(attachment.size)} ` +
              `bytes, exceeding the ${String(MAX_ATTACHMENT_DOWNLOAD_BYTES)}-byte download cap.`,
          });
        }
        const { bytes, contentType } = await client.downloadBinary(
          attachment.url,
        );
        return {
          file_base64: bytes.toString("base64"),
          file_name: attachment.name,
          content_type: contentType,
          size: attachment.size,
          sha1: attachment.sha1,
        };
      });
    },
  );

  server.registerTool(
    "attachment_delete",
    {
      description:
        "Delete an attachment by id. This cannot be undone. Requires " +
        "confirmation: elicitation-capable clients are prompted " +
        "interactively; others must call again with confirm: true after " +
        "reviewing the preview returned by the first call.",
      inputSchema: attachmentDeleteInput,
    },
    async (args) => {
      const entry = RESOURCE_REGISTRY[args.resource];
      const basePath = `${entry.basePath}/attachments`;
      const gate = await confirmDestructiveOp({
        server,
        client,
        basePath,
        id: args.id,
        resourceLabel: "attachment",
        args,
        requireElicitation,
      });
      if (!gate.proceed) {
        return {
          content: [
            { type: "text", text: gate.message ?? "Not deleted — cancelled." },
          ],
        };
      }
      return handleTool("attachment_delete", args, () =>
        client.delete(`${basePath}/${String(args.id)}`),
      );
    },
  );
}
