import { z } from "zod";

export const userStoryListInput = {
  project: z.number().int().describe("Project id to scope the list to"),
  milestone: z.number().int().optional(),
  status: z.number().int().optional(),
  epic: z.number().int().optional(),
  q: z.string().optional(),
};

export const userStoryCreateInput = {
  project: z.number().int(),
  subject: z.string().min(1),
  description: z.string().optional(),
  status: z.number().int().optional(),
  assigned_to: z.number().int().optional(),
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
  assigned_to: z.number().int().optional(),
  milestone: z.number().int().optional(),
  tags: z.array(z.string()).optional(),
  points: z.record(z.string(), z.number()).optional(),
};
