import { z } from "zod";
import type { Verbosity } from "./response-fields.js";

/** Matches Taiga's own live-confirmed server-side default (phase 9) —
 * exposing it explicitly rather than leaving it implicit. */
export const DEFAULT_PAGE_SIZE = 30;
export const DEFAULT_VERBOSITY: Verbosity = "full";

export const paginationShape = {
  page: z.number().int().min(1).optional().describe("1-indexed page number"),
  page_size: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(`Items per page. Default ${String(DEFAULT_PAGE_SIZE)}.`),
};

export const verbosityField = z
  .enum(["minimal", "standard", "full"])
  .optional()
  .describe(
    'Trims the response\'s fields to cut token cost. "full" (default) ' +
      '= every field Taiga returns. "standard" drops denormalized ' +
      "*_extra_info objects, *_html duplicate fields, and UI-only " +
      'ordering fields. "minimal" keeps only id/ref/subject/status/' +
      "assigned_to/project/is_closed.",
  );

export const verbosityShape = { verbosity: verbosityField };
