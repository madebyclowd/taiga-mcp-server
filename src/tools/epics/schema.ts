import { z } from "zod";

export const epicListInput = {
  project: z.number().int().describe("Project id to scope the list to"),
  status: z.number().int().optional(),
  assigned_to: z.number().int().optional(),
  q: z.string().optional(),
};

export const epicCreateInput = {
  project: z.number().int(),
  subject: z.string().min(1),
  description: z.string().optional(),
  status: z.number().int().optional(),
  assigned_to: z.number().int().optional(),
  milestone: z.number().int().optional(),
  tags: z.array(z.string()).optional(),
  color: z.string().optional(),
};

export const epicUpdateInput = {
  subject: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.number().int().optional(),
  assigned_to: z.number().int().optional(),
  milestone: z.number().int().optional(),
  tags: z.array(z.string()).optional(),
  color: z.string().optional(),
};
