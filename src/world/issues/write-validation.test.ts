import { describe, expect, it } from "vitest";
import { requestHasSameOrigin, validateCreateIssueInput } from "./write-validation";

describe("issue write validation", () => {
  it("normalizes an allowed non-placement issue payload", () => {
    expect(validateCreateIssueInput({
      title: "  Missing guardrail  ", description: "  North stair  ", issueSubtypeId: "sub-1", assignedTo: "user-1",
    })).toEqual({
      title: "Missing guardrail", description: "North stair", issueSubtypeId: "sub-1", assignedTo: "user-1", assignedToType: "user",
    });
  });

  it("rejects missing or oversized required fields", () => {
    expect(validateCreateIssueInput({ title: "", issueSubtypeId: "sub-1" })).toBeUndefined();
    expect(validateCreateIssueInput({ title: "x".repeat(201), issueSubtypeId: "sub-1" })).toBeUndefined();
    expect(validateCreateIssueInput({ title: "Valid", issueSubtypeId: "" })).toBeUndefined();
  });

  it("accepts only the application origin", () => {
    expect(requestHasSameOrigin("http://localhost:3000/api/world/issues", "http://localhost:3000")).toBe(true);
    expect(requestHasSameOrigin("http://localhost:3000/api/world/issues", "https://attacker.example")).toBe(false);
    expect(requestHasSameOrigin("http://localhost:3000/api/world/issues", null)).toBe(false);
  });
});
