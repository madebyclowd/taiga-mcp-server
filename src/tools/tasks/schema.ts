import { z } from "zod";

export const taskListInput = {
  project: z.number().int().describe("Project id to scope the list to"),
  user_story: z
    .number()
    .int()
    .optional()
    .describe("Filter by parent user story id"),
  milestone: z.number().int().optional(),
  status: z.number().int().optional(),
};

const assignedToInput = z
  .union([z.number().int(), z.string().min(1), z.null()])
  .optional()
  .describe(
    "Numeric user id, or email/full name (resolved against " +
      "project members). null explicitly unassigns; omit to leave unchanged.",
  );

const watchersInput = z
  .array(z.union([z.number().int(), z.string().min(1)]))
  .optional()
  .describe(
    "Numeric user ids and/or email/full name (resolved " +
      "against project members). Omit to leave unchanged.",
  );

export const taskCreateInput = {
  project: z.number().int(),
  user_story: z
    .number()
    .int()
    .describe("Parent user story id — required by Taiga for task creation"),
  subject: z.string().min(1),
  description: z.string().optional(),
  status: z.number().int().optional(),
  assigned_to: assignedToInput,
  watchers: watchersInput,
  milestone: z.number().int().optional(),
  tags: z.array(z.string()).optional(),
};

export const taskUpdateInput = {
  subject: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.number().int().optional(),
  assigned_to: assignedToInput,
  watchers: watchersInput,
  milestone: z.number().int().optional(),
  user_story: z
    .number()
    .int()
    .optional()
    .describe("Move to a different parent user story"),
  tags: z.array(z.string()).optional(),
};
