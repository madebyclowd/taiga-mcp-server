import { z } from "zod";

const batchIssueItem = z.object({
  subject: z.string().min(1),
  type: z.number().int().describe("Issue type id — required by Taiga"),
  priority: z.number().int().describe("Priority id — required by Taiga"),
  severity: z.number().int().describe("Severity id — required by Taiga"),
  description: z.string().optional(),
  status: z.number().int().optional(),
  assigned_to: z.number().int().optional(),
  milestone: z.number().int().optional(),
  tags: z.array(z.string()).optional(),
});

export const batchCreateIssuesInput = {
  project: z.number().int(),
  items: z.array(batchIssueItem).min(1).max(20),
};

const batchUserStoryItem = z.object({
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
});

export const batchCreateUserStoriesInput = {
  project: z.number().int(),
  items: z.array(batchUserStoryItem).min(1).max(20),
};

const batchTaskItem = z.object({
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
});

export const batchCreateTasksInput = {
  project: z.number().int(),
  items: z.array(batchTaskItem).min(1).max(20),
};
