import { z } from "zod";

export const commentableResource = z.enum([
  "epic",
  "user_story",
  "task",
  "issue",
]);

export const commentAddInput = {
  resource: commentableResource,
  id: z.number().int().describe("Id of the epic/user story/task/issue"),
  comment: z.string().min(1),
};

export const commentListInput = {
  resource: commentableResource,
  id: z.number().int().describe("Id of the epic/user story/task/issue"),
};

export const commentEditInput = {
  resource: commentableResource,
  id: z.number().int().describe("Id of the epic/user story/task/issue"),
  comment_id: z.string().uuid().describe("The comment's history-entry id"),
  comment: z.string().min(1).describe("New comment text"),
};

export const commentDeleteInput = {
  resource: commentableResource,
  id: z.number().int().describe("Id of the epic/user story/task/issue"),
  comment_id: z.string().uuid().describe("The comment's history-entry id"),
  confirm: z
    .boolean()
    .optional()
    .describe(
      "Set true to actually delete after reviewing the preview from a " +
        "first call without it. Ignored by elicitation-capable clients, " +
        "which are prompted interactively instead.",
    ),
};
