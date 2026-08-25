import { describe, expect, it } from "vitest";
import { issueVisualState } from "./issue-state";

describe("issueVisualState", () => {
  const now = new Date("2026-08-19T12:00:00Z");

  it("keeps closed issues closed even after their due date", () => {
    expect(issueVisualState("closed", "2026-01-01", now)).toBe("closed");
  });

  it("marks an unfinished issue with a past due date as overdue", () => {
    expect(issueVisualState("open", "2026-08-18", now)).toBe("overdue");
  });

  it("maps known active states and preserves unknown states", () => {
    expect(issueVisualState("answered", undefined, now)).toBe("answered");
    expect(issueVisualState("open", undefined, now)).toBe("open");
    expect(issueVisualState("custom workflow", undefined, now)).toBe("unknown");
  });
});
