import { z } from "zod";

export const rawRequestInput = {
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  path: z
    .string()
    .startsWith("/api/v1/")
    .refine((path) => !path.includes(".."), {
      message: 'Path traversal segments ("..") are not allowed.',
    })
    .describe(
      "Must be an /api/v1/... path on the configured Taiga instance — " +
        "no absolute URLs, no other hosts, no path traversal.",
    ),
  query: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .optional(),
  body: z.unknown().optional(),
};
