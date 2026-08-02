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
  is_backlog_activated: z
    .boolean()
    .optional()
    .describe("Enable/disable the Backlog module"),
  is_kanban_activated: z
    .boolean()
    .optional()
    .describe("Enable/disable the Kanban module"),
  is_wiki_activated: z
    .boolean()
    .optional()
    .describe("Enable/disable the Wiki module"),
  is_issues_activated: z
    .boolean()
    .optional()
    .describe("Enable/disable the Issues module"),
  is_epics_activated: z
    .boolean()
    .optional()
    .describe(
      "Enable/disable the Epics module. Epics created while this is " +
        "false exist via the API but are invisible in Taiga's web UI " +
        "until enabled.",
    ),
};
