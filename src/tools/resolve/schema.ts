import { z } from "zod";

export const refResolveInput = {
  project: z
    .union([z.number().int(), z.string().min(1)])
    .describe("Project id or slug"),
  ref: z
    .union([z.number().int(), z.string().min(1)])
    .describe(
      'Ref number for an issue/user story/task/epic, e.g. 436 or "#436"',
    ),
};
