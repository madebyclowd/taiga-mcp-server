import { z } from "zod";

export const filtersDataInput = {
  project: z.number().int().describe("Project id"),
};
