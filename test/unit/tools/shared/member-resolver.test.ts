import { describe, expect, it } from "vitest";
import {
  MemberResolutionError,
  needsResolution,
  resolveAssignmentFields,
  resolveMemberIdentifier,
  resolveWatcherIdentifiers,
  type ProjectMember,
} from "../../../../src/tools/shared/member-resolver.js";

const members: ProjectMember[] = [
  { user: 1, full_name: "Alice A", email: "alice@example.com" },
  { user: 2, full_name: "Bob B", email: "bob@example.com" },
  { user: 3, full_name: "Alice A", email: "alice2@example.com" },
];

describe("resolveMemberIdentifier", () => {
  it("passes a numeric identifier straight through, no lookup", () => {
    expect(resolveMemberIdentifier(members, 99)).toBe(99);
  });

  it("matches by exact email, case-insensitively", () => {
    expect(resolveMemberIdentifier(members, "Bob@Example.com")).toBe(2);
  });

  it("matches by exact full_name when unambiguous", () => {
    expect(resolveMemberIdentifier(members, "Bob B")).toBe(2);
  });

  it("throws a structured no_match error listing every member", () => {
    try {
      resolveMemberIdentifier(members, "nobody");
      expect.fail("expected resolveMemberIdentifier to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(MemberResolutionError);
      const structured = (error as MemberResolutionError).toStructured();
      expect(structured.error).toBe("no_match");
      expect(structured.identifier).toBe("nobody");
      expect(structured.candidates).toHaveLength(3);
    }
  });

  it("throws a structured ambiguous_match error listing only the matches", () => {
    try {
      // full_name "Alice A" matches both user 1 and user 3.
      resolveMemberIdentifier(members, "Alice A");
      expect.fail("expected resolveMemberIdentifier to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(MemberResolutionError);
      const structured = (error as MemberResolutionError).toStructured();
      expect(structured.error).toBe("ambiguous_match");
      expect(structured.candidates.map((c) => c.id)).toEqual([1, 3]);
    }
  });

  it("does not fuzzy/substring match", () => {
    expect(() => resolveMemberIdentifier(members, "ali")).toThrow(
      MemberResolutionError,
    );
  });
});

describe("resolveWatcherIdentifiers", () => {
  it("resolves every entry, numeric and string mixed", () => {
    expect(
      resolveWatcherIdentifiers(members, ["alice@example.com", 2, "Bob B"]),
    ).toEqual([1, 2, 2]);
  });

  it("fails the whole array on a single unresolvable identifier (all-or-nothing)", () => {
    expect(() =>
      resolveWatcherIdentifiers(members, ["alice@example.com", "nobody"]),
    ).toThrow(MemberResolutionError);
  });
});

describe("needsResolution", () => {
  it("is false when assigned_to and watchers are already numeric/absent", () => {
    expect(needsResolution({})).toBe(false);
    expect(needsResolution({ assigned_to: 1 })).toBe(false);
    expect(needsResolution({ assigned_to: null })).toBe(false);
    expect(needsResolution({ watchers: [1, 2] })).toBe(false);
  });

  it("is true when assigned_to is a string", () => {
    expect(needsResolution({ assigned_to: "alice@example.com" })).toBe(true);
  });

  it("is true when any watcher entry is a string", () => {
    expect(needsResolution({ watchers: [1, "Bob B"] })).toBe(true);
  });
});

describe("resolveAssignmentFields", () => {
  it("resolves a string assigned_to to a numeric id", () => {
    expect(
      resolveAssignmentFields(members, { assigned_to: "bob@example.com" }),
    ).toEqual({ assigned_to: 2 });
  });

  it("passes null through as an explicit unassign, no lookup", () => {
    expect(resolveAssignmentFields(members, { assigned_to: null })).toEqual({
      assigned_to: null,
    });
  });

  it("resolves a mixed watchers array", () => {
    expect(
      resolveAssignmentFields(members, { watchers: ["alice@example.com", 2] }),
    ).toEqual({ watchers: [1, 2] });
  });

  it("only includes fields that were actually present in args", () => {
    expect(resolveAssignmentFields(members, {})).toEqual({});
  });
});
