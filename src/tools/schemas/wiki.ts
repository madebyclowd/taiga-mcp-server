import { z } from "zod";

export const wikiListInput = {
  project: z.number().int().describe("Project id to scope the list to"),
};

export const wikiCreateInput = {
  project: z.number().int(),
  slug: z.string().min(1).describe("URL-safe unique slug within the project"),
  content: z.string(),
};

export const wikiUpdateInput = {
  slug: z.string().min(1).optional(),
  content: z.string().optional(),
};
