import { z } from "zod";

/** Only these support voting on Taiga — milestones and wiki pages don't. */
export const votableResource = z.enum(["epic", "user_story", "task", "issue"]);

/** All six resource types support watching. */
export const watchableResource = z.enum([
  "epic",
  "user_story",
  "task",
  "issue",
  "milestone",
  "wiki_page",
]);

export const voteInput = {
  resource: votableResource,
  id: z.number().int(),
};

export const watchInput = {
  resource: watchableResource,
  id: z.number().int(),
};
