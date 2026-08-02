import { z } from "zod";

export const issueListInput = {
  project: z.number().int().describe("Project id to scope the list to"),
  status: z.number().int().optional(),
  type: z.number().int().optional(),
  priority: z.number().int().optional(),
  severity: z.number().int().optional(),
  assigned_to: z.number().int().optional(),
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

export const issueCreateInput = {
  project: z.number().int(),
  subject: z.string().min(1),
  type: z.number().int().describe("Issue type id — required by Taiga"),
  priority: z.number().int().describe("Priority id — required by Taiga"),
  severity: z.number().int().describe("Severity id — required by Taiga"),
  description: z.string().optional(),
  status: z.number().int().optional(),
  assigned_to: assignedToInput,
  watchers: watchersInput,
  milestone: z.number().int().optional(),
  tags: z.array(z.string()).optional(),
};

export const issueUpdateInput = {
  subject: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.number().int().optional(),
  type: z.number().int().optional(),
  priority: z.number().int().optional(),
  severity: z.number().int().optional(),
  assigned_to: assignedToInput,
  watchers: watchersInput,
  milestone: z.number().int().optional(),
  tags: z.array(z.string()).optional(),
};

/** Fields for the dedicated classification-only convenience tool. */
export const issueClassificationInput = {
  id: z.number().int().describe("Issue id"),
  type: z.number().int().optional(),
  status: z.number().int().optional(),
  priority: z.number().int().optional(),
  severity: z.number().int().optional(),
};
