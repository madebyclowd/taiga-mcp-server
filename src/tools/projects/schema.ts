import { z } from "zod";

export const projectListInput = {
  member: z.number().int().optional().describe("Filter by member user id"),
  q: z.string().optional().describe("Search text"),
};

export const projectCreateInput = {
  name: z.string().min(1),
  description: z.string().min(1),
  is_private: z.boolean().optional(),
};

export const projectUpdateInput = {
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  is_private: z.boolean().optional(),
};
