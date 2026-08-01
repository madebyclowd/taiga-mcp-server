import { z } from "zod";

/** Resources that support attachments on Taiga — milestones don't. */
export const attachableResource = z.enum([
  "epic",
  "user_story",
  "task",
  "issue",
  "wiki_page",
]);

export const attachmentListInput = {
  resource: attachableResource,
  object_id: z
    .number()
    .int()
    .describe("Id of the parent epic/story/task/issue/wiki page"),
};

export const attachmentUploadInput = {
  resource: attachableResource,
  object_id: z
    .number()
    .int()
    .describe("Id of the parent epic/story/task/issue/wiki page"),
  project: z.number().int(),
  file_name: z.string().min(1),
  file_base64: z.string().min(1).describe("File contents, base64-encoded"),
  content_type: z
    .string()
    .optional()
    .describe("MIME type, defaults to application/octet-stream"),
  description: z.string().optional(),
};

export const attachmentDeleteInput = {
  resource: attachableResource,
  id: z.number().int().describe("Attachment id"),
};
