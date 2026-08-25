import { describe, expect, it } from "vitest";
import {
  adaptApsAsset,
  adaptApsDocument,
  adaptApsForm,
  adaptApsIssue,
  adaptApsPerson,
} from ".";

const context = { projectId: "b.project-1" };

describe("APS world adapters", () => {
  it("normalizes an asset and retains its raw payload", () => {
    const raw = { id: "a-1", clientAssetId: "AHU-0042", status: "pending", categoryId: "hvac" };
    const entity = adaptApsAsset(raw, context);
    expect(entity).toMatchObject({
      id: "asset:a-1",
      externalId: "a-1",
      type: "asset",
      title: "AHU-0042",
      status: "pending",
      source: "aps",
      projectId: "b.project-1",
    });
    expect(entity.metadata.raw).toBe(raw);
  });

  it.each([
    [adaptApsIssue, { id: "i-1", title: "Missing detail", status: "open" }, "issue:i-1", "Missing detail"],
    [adaptApsDocument, { id: "d-1", attributes: { displayName: "Plan.pdf" } }, "document:d-1", "Plan.pdf"],
    [adaptApsForm, { id: "f-1", name: "Safety check", status: "draft" }, "form:f-1", "Safety check"],
    [adaptApsPerson, { id: "p-1", firstName: "Mikkel", lastName: "Sørensen" }, "person:p-1", "Mikkel Sørensen"],
  ])("normalizes each APS source independently", (adapter, raw, id, title) => {
    expect(adapter(raw, context)).toMatchObject({ id, title, source: "aps", projectId: context.projectId });
  });

  it("rejects source records without a stable external ID", () => {
    expect(() => adaptApsAsset({ name: "Unnamed ID" }, context)).toThrow("missing external ID");
  });
});
