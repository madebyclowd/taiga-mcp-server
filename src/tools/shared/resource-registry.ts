/**
 * Central id -> Taiga endpoint mapping for the cross-resource tool
 * groups (comments, attachments, vote/watch) that would otherwise
 * duplicate this table five times. Capability flags reflect what each
 * endpoint actually supports, confirmed live against a real Taiga Cloud
 * instance during phase 3 — not all resources support every action
 * (e.g. milestones/wiki pages don't support voting).
 */
export interface ResourceEntry {
  /** e.g. "/api/v1/epics" */
  basePath: string;
  /** Taiga's `/api/v1/history/{slug}/{id}` path segment. */
  historySlug?: string;
  supportsVote: boolean;
  supportsWatch: boolean;
  supportsComments: boolean;
  supportsAttachments: boolean;
}

export const RESOURCE_REGISTRY = {
  epic: {
    basePath: "/api/v1/epics",
    historySlug: "epic",
    supportsVote: true,
    supportsWatch: true,
    supportsComments: true,
    supportsAttachments: true,
  },
  user_story: {
    basePath: "/api/v1/userstories",
    historySlug: "userstory",
    supportsVote: true,
    supportsWatch: true,
    supportsComments: true,
    supportsAttachments: true,
  },
  task: {
    basePath: "/api/v1/tasks",
    historySlug: "task",
    supportsVote: true,
    supportsWatch: true,
    supportsComments: true,
    supportsAttachments: true,
  },
  issue: {
    basePath: "/api/v1/issues",
    historySlug: "issue",
    supportsVote: true,
    supportsWatch: true,
    supportsComments: true,
    supportsAttachments: true,
  },
  milestone: {
    basePath: "/api/v1/milestones",
    supportsVote: false,
    supportsWatch: true,
    supportsComments: false,
    supportsAttachments: false,
  },
  wiki_page: {
    basePath: "/api/v1/wiki",
    supportsVote: false,
    supportsWatch: true,
    supportsComments: false,
    supportsAttachments: true,
  },
} as const satisfies Record<string, ResourceEntry>;

export type ResourceName = keyof typeof RESOURCE_REGISTRY;
