import { describe, expect, it } from "vitest";
import { groupDistrictEntities, isUngrouped } from "./grouping";
import type { WorldEntity } from "./world-entity";
import type { AssetStatusOption } from "../zones";

const statuses: AssetStatusOption[] = [
  { id: "s1", label: "Specified" },
  { id: "s2", label: "Ordered" },
  { id: "s3", label: "Delivered" },
];

function asset(index: number, statusId?: string, status?: string): WorldEntity {
  return {
    id: `asset:${index}`, externalId: `a${index}`, type: "asset", title: `Wall ${index}`,
    status, source: "aps", projectId: "p", zone: "assets",
    metadata: { raw: {}, ...(statusId ? { statusId } : {}) },
  };
}

function issue(index: number, visualState: string): WorldEntity {
  return {
    id: `issue:${index}`, externalId: `i${index}`, type: "issue", title: `Issue ${index}`,
    source: "aps", projectId: "p", zone: "issues", metadata: { raw: {}, visualState },
  };
}

describe("groupDistrictEntities", () => {
  it("groups assets in the project's own status order, matching the yard lanes", () => {
    const groups = groupDistrictEntities(
      [asset(1, "s3"), asset(2, "s1"), asset(3, "s2"), asset(4, "s1")],
      "assets",
      statuses,
    );
    expect(groups.map((group) => group.label)).toEqual(["Specified", "Ordered", "Delivered"]);
    expect(groups[0].entities.map((entity) => entity.id)).toEqual(["asset:2", "asset:4"]);
  });

  it("puts assets whose status is not in the project's set last", () => {
    const groups = groupDistrictEntities([asset(1, "gone", "Retired"), asset(2, "s1")], "assets", statuses);
    expect(groups[groups.length - 1].entities[0].id).toBe("asset:1");
  });

  it("labels an unresolved asset group from the record's own status text", () => {
    const groups = groupDistrictEntities([asset(1, undefined, "Retired")], "assets", statuses);
    expect(groups[0].label).toBe("Retired");
  });

  it("groups issues in bay order so the panel matches the yard", () => {
    const groups = groupDistrictEntities(
      [issue(1, "closed"), issue(2, "open"), issue(3, "overdue"), issue(4, "open")],
      "issues",
      [],
    );
    expect(groups.map((group) => group.label)).toEqual(["Open", "Overdue", "Closed"]);
    expect(groups[0].entities).toHaveLength(2);
  });

  it("treats an unreadable issue state as the other-status bay", () => {
    const groups = groupDistrictEntities([issue(1, "something-else")], "issues", []);
    expect(groups[0].label).toBe("Other status");
  });

  it("keeps every record exactly once", () => {
    const entities = [asset(1, "s1"), asset(2, "s2"), asset(3, "gone"), asset(4)];
    const grouped = groupDistrictEntities(entities, "assets", statuses).flatMap((group) => group.entities);
    expect(grouped).toHaveLength(entities.length);
    expect(new Set(grouped.map((entity) => entity.id)).size).toBe(entities.length);
  });

  it("leaves people and documents in one list", () => {
    const person: WorldEntity = {
      id: "person:1", externalId: "p1", type: "person", title: "Alexandre Moneron",
      source: "aps", projectId: "p", metadata: { raw: {} },
    };
    const groups = groupDistrictEntities([person], "people", []);
    expect(isUngrouped(groups)).toBe(true);
    expect(groups[0].entities).toHaveLength(1);
  });

  it("returns nothing for an empty district", () => {
    expect(groupDistrictEntities([], "assets", statuses)).toEqual([]);
  });
});
