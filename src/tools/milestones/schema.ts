import { z } from "zod";

export const milestoneListInput = {
  project: z.number().int().describe("Project id to scope the list to"),
};

export const milestoneCreateInput = {
  project: z.number().int(),
  name: z.string().min(1),
  estimated_start: z
    .string()
    .describe("ISO date (YYYY-MM-DD) — required by Taiga"),
  estimated_finish: z
    .string()
    .describe("ISO date (YYYY-MM-DD) — required by Taiga"),
};

export const milestoneUpdateInput = {
  name: z.string().min(1).optional(),
  estimated_start: z.string().optional(),
  estimated_finish: z.string().optional(),
  closed: z.boolean().optional(),
};
