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

export const taskCreateInput = {
  project: z.number().int(),
  user_story: z
    .number()
    .int()
    .describe("Parent user story id — required by Taiga for task creation"),
  subject: z.string().min(1),
  description: z.string().optional(),
  status: z.number().int().optional(),
  assigned_to: z.number().int().optional(),
  milestone: z.number().int().optional(),
  tags: z.array(z.string()).optional(),
};

export const taskUpdateInput = {
  subject: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.number().int().optional(),
  assigned_to: z.number().int().optional(),
  milestone: z.number().int().optional(),
  user_story: z
    .number()
    .int()
    .optional()
    .describe("Move to a different parent user story"),
  tags: z.array(z.string()).optional(),
};
