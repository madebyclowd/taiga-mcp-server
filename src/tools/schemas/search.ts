import { z } from "zod";

export const searchInput = {
  project: z.number().int().describe("Project id to search within"),
  text: z.string().min(1).describe("Search text"),
};
