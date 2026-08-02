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
  assigned_to: z
    .union([z.number().int(), z.string().min(1), z.null()])
    .optional()
    .describe(
      "Numeric user id, or email/full name (resolved against " +
        "project members). null explicitly unassigns; omit to leave unchanged.",
    ),
  watchers: z
    .array(z.union([z.number().int(), z.string().min(1)]))
    .optional()
    .describe(
      "Numeric user ids and/or email/full name (resolved " +
        "against project members). Omit to leave unchanged.",
    ),
  milestone: z.number().int().optional(),
  tags: z.array(z.string()).optional(),
  color: z.string().optional(),
};

export const epicUpdateInput = {
  subject: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.number().int().optional(),
  assigned_to: z
    .union([z.number().int(), z.string().min(1), z.null()])
    .optional()
    .describe(
      "Numeric user id, or email/full name (resolved against " +
        "project members). null explicitly unassigns; omit to leave unchanged.",
    ),
  watchers: z
    .array(z.union([z.number().int(), z.string().min(1)]))
    .optional()
    .describe(
      "Numeric user ids and/or email/full name (resolved " +
        "against project members). Omit to leave unchanged.",
    ),
  milestone: z.number().int().optional(),
  tags: z.array(z.string()).optional(),
  color: z.string().optional(),
};
