import { z } from "zod";

export const membershipListInput = {
  project: z.number().int().describe("Project id to scope the list to"),
};

export const membershipCreateInput = {
  project: z.number().int(),
  role: z.number().int().describe("Role id within the project"),
  username: z
    .string()
    .optional()
    .describe("Existing Taiga username to invite — or use email"),
  email: z
    .string()
    .optional()
    .describe(
      "Email to invite (existing user or new invitee) — or use username",
    ),
};

export const membershipUpdateInput = {
  role: z.number().int().optional(),
};

export const membershipBulkCreateInput = {
  project_id: z.number().int(),
  bulk_memberships: z
    .array(
      z.object({
        role_id: z.number().int(),
        username: z
          .string()
          .optional()
          .describe("Existing Taiga username — or use email"),
        email: z.string().optional().describe("Invite email — or use username"),
      }),
    )
    .min(1),
};
