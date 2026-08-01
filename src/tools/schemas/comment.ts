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
