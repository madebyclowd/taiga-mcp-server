import { describe, expect, it } from "vitest";
import {
  applyVerbosity,
  applyVerbosityToItems,
} from "../../../../src/tools/shared/response-fields.js";

// Close to the audit-02 live-captured real user-story field shape
// (56 fields) — trimmed to the fields relevant to each tier's rule.
const sampleUserStory = {
  id: 1,
  ref: 42,
  subject: "Fix login button",
  status: 10,
  status_extra_info: { name: "New", color: "#000" },
  assigned_to: 5,
  assigned_to_extra_info: { full_name: "Alice" },
  project: 99,
  project_extra_info: { name: "Demo" },
  is_closed: false,
  description: "plain text",
  description_html: "<p>plain text</p>",
  backlog_order: 3,
  sprint_order: 1,
  kanban_order: 2,
  swimlane: null,
  tags: ["bug"],
  watchers: [1, 2],
};

describe("applyVerbosity", () => {
  it("full returns the object unchanged", () => {
    expect(applyVerbosity(sampleUserStory, "full")).toBe(sampleUserStory);
  });

  it("standard drops *_extra_info, *_html, and the 4 UI-ordering fields", () => {
    const result = applyVerbosity(sampleUserStory, "standard");
    expect(result).toEqual({
      id: 1,
      ref: 42,
      subject: "Fix login button",
      status: 10,
      assigned_to: 5,
      project: 99,
      is_closed: false,
      description: "plain text",
      tags: ["bug"],
      watchers: [1, 2],
    });
  });

  it("minimal keeps only the 7 named fields, whichever are present", () => {
    const result = applyVerbosity(sampleUserStory, "minimal");
    expect(result).toEqual({
      id: 1,
      ref: 42,
      subject: "Fix login button",
      status: 10,
      assigned_to: 5,
      project: 99,
      is_closed: false,
    });
  });

  it("minimal on an object missing some of the 7 fields (e.g. wiki) only includes what's present", () => {
    const wikiPage = { id: 1, slug: "home", content: "..." };
    expect(applyVerbosity(wikiPage, "minimal")).toEqual({ id: 1 });
  });
});

describe("applyVerbosityToItems", () => {
  it("full returns the same array reference, unmapped", () => {
    const items = [sampleUserStory];
    expect(applyVerbosityToItems(items, "full")).toBe(items);
  });

  it("maps applyVerbosity over every item for non-full tiers", () => {
    const items = [sampleUserStory, { ...sampleUserStory, id: 2 }];
    const result = applyVerbosityToItems(items, "minimal");
    expect(result).toEqual([
      {
        id: 1,
        ref: 42,
        subject: "Fix login button",
        status: 10,
        assigned_to: 5,
        project: 99,
        is_closed: false,
      },
      {
        id: 2,
        ref: 42,
        subject: "Fix login button",
        status: 10,
        assigned_to: 5,
        project: 99,
        is_closed: false,
      },
    ]);
  });
});
