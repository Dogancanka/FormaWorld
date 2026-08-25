import { describe, expect, it } from "vitest";
import { projectUuid } from "./project-id";

describe("projectUuid", () => {
  it("removes the Data Management b. prefix for Construction APIs", () => {
    expect(projectUuid("b.1234-5678")).toBe("1234-5678");
  });

  it("preserves an already normalized project UUID", () => {
    expect(projectUuid("1234-5678")).toBe("1234-5678");
  });
});
