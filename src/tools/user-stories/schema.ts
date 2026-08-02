import { z } from "zod";

export const userStoryListInput = {
  project: z.number().int().describe("Project id to scope the list to"),
  milestone: z.number().int().optional(),
  status: z.number().int().optional(),
  epic: z.number().int().optional(),
  q: z.string().optional(),
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

export const userStoryCreateInput = {
  project: z.number().int(),
  subject: z.string().min(1),
  description: z.string().optional(),
  status: z.number().int().optional(),
  assigned_to: assignedToInput,
  watchers: watchersInput,
  milestone: z.number().int().optional(),
  tags: z.array(z.string()).optional(),
  points: z
    .record(z.string(), z.number())
    .optional()
    .describe("Map of role id (as string) to point value"),
};

export const userStoryUpdateInput = {
  subject: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.number().int().optional(),
  assigned_to: assignedToInput,
  watchers: watchersInput,
  milestone: z.number().int().optional(),
  tags: z.array(z.string()).optional(),
  points: z.record(z.string(), z.number()).optional(),
};
