import { describe, expect, it } from "vitest";
import { validateWorldActionInput } from "./validation";

describe("world action validation", () => {
  it("accepts supported status and form actions", () => {
    expect(validateWorldActionInput({ entityType: "issue", entityId: " issue-1 ", kind: "set_status", value: "closed" }))
      .toEqual({ entityType: "issue", entityId: "issue-1", kind: "set_status", value: "closed" });
    expect(validateWorldActionInput({ entityType: "form", entityId: "form-1", kind: "submit_form", value: "submitted" }))
      .toEqual({ entityType: "form", entityId: "form-1", kind: "submit_form", value: "submitted" });
  });

  it("rejects unsupported type/action combinations and blank values", () => {
    expect(validateWorldActionInput({ entityType: "person", entityId: "p", kind: "set_status", value: "active" })).toBeUndefined();
    expect(validateWorldActionInput({ entityType: "form", entityId: "f", kind: "set_status", value: "submitted" })).toBeUndefined();
    expect(validateWorldActionInput({ entityType: "asset", entityId: "a", kind: "set_status", value: "" })).toBeUndefined();
  });
});
