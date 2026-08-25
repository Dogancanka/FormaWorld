import { describe, expect, it } from "vitest";
import type { WorldEntity } from "../entities";
import { relatedEntities, resolveWorldRelationships } from "./resolve";

const entities: WorldEntity[] = [
  { id: "issue:i1", externalId: "i1", type: "issue", title: "Issue", source: "aps", projectId: "p", metadata: { raw: { assignedTo: "user-autodesk-id" } } },
  { id: "person:p1", externalId: "p1", type: "person", title: "Ada", source: "aps", projectId: "p", metadata: { raw: { autodeskId: "user-autodesk-id" } } },
  { id: "asset:a1", externalId: "a1", type: "asset", title: "Pump", source: "aps", projectId: "p", metadata: { raw: {} } },
];

describe("world relationships", () => {
  it("resolves documented APS endpoint IDs and explicit issue assignments", () => {
    const result = resolveWorldRelationships([{
      id: "r1",
      endpoints: [
        { domain: "autodesk-bim360-issue", apsType: "coordination", externalId: "i1", entityType: "issue" },
        { domain: "autodesk-bim360-asset", apsType: "asset", externalId: "a1", entityType: "asset" },
      ],
    }], entities);
    expect(result.map((relationship) => relationship.type)).toEqual(["aps-relationship", "issue-assignee"]);
  });

  it("can traverse the same relationship in both directions", () => {
    const relationships = resolveWorldRelationships([], entities);
    expect(relatedEntities("issue:i1", relationships, entities)[0].entity.id).toBe("person:p1");
    expect(relatedEntities("person:p1", relationships, entities)[0].entity.id).toBe("issue:i1");
  });

  it("does not infer relationships from matching titles", () => {
    const sameNames = entities.map((entity) => ({ ...entity, title: "Same name", metadata: { raw: {} } }));
    expect(resolveWorldRelationships([], sameNames)).toEqual([]);
  });
});
