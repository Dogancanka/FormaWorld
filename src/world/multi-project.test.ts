import { describe, expect, it } from "vitest";
import type { WorldEntity } from "./entities/world-entity";
import type { IssueFeed } from "./issues/types";
import { COMPOUND_GAP, mergeEntityFeeds, mergeStatusOptions, placeCompounds } from "./multi-project";

const EMPTY_ISSUES: IssueFeed = { state: "empty", entities: [], total: 0, limit: 50 };

function entity(id: string, projectId: string): WorldEntity {
  return { id, externalId: id, type: "issue", title: id, source: "aps", projectId, metadata: {} };
}

function feed(partial: Partial<IssueFeed>): IssueFeed {
  return { ...EMPTY_ISSUES, ...partial };
}

describe("mergeEntityFeeds", () => {
  it("returns the single feed untouched for a one-project world", () => {
    const only = feed({ state: "available", entities: [entity("i1", "p1")], total: 1 });
    expect(mergeEntityFeeds([only], EMPTY_ISSUES)).toBe(only);
  });

  it("adds up records and totals across projects", () => {
    const merged = mergeEntityFeeds([
      feed({ state: "available", entities: [entity("i1", "p1")], total: 12, limit: 50 }),
      feed({ state: "available", entities: [entity("i2", "p2")], total: 7, limit: 50 }),
    ], EMPTY_ISSUES);
    expect(merged?.entities.map((record) => record.id)).toEqual(["i1", "i2"]);
    expect(merged?.total).toBe(19);
    expect(merged?.limit).toBe(100);
  });

  it("does not call the world broken because one project lacks a module", () => {
    // Worst-of would report the whole overview as failed when a single
    // compound has no RFI module. The per-project alerts still name it.
    const merged = mergeEntityFeeds([
      feed({ state: "available", entities: [entity("i1", "p1")], total: 3 }),
      feed({ state: "unsupported", httpStatus: 404, error: "not available" }),
    ], EMPTY_ISSUES);
    expect(merged?.state).toBe("available");
    expect(merged?.error).toBe("not available");
  });

  it("ignores projects that have not answered yet", () => {
    const merged = mergeEntityFeeds([
      undefined,
      feed({ state: "available", entities: [entity("i2", "p2")], total: 4 }),
    ], EMPTY_ISSUES);
    expect(merged?.total).toBe(4);
  });

  it("is undefined while no project has answered", () => {
    expect(mergeEntityFeeds([undefined, undefined], EMPTY_ISSUES)).toBeUndefined();
  });
});

describe("mergeStatusOptions", () => {
  it("keeps the first occurrence of each status so the order is stable", () => {
    expect(mergeStatusOptions([
      [{ id: "s1", label: "Ordered" }, { id: "s2", label: "Delivered" }],
      [{ id: "s2", label: "Delivered" }, { id: "s3", label: "Installed" }],
    ])).toEqual([
      { id: "s1", label: "Ordered" },
      { id: "s2", label: "Delivered" },
      { id: "s3", label: "Installed" },
    ]);
  });
});

describe("placeCompounds", () => {
  const footprint = (projectId: string, halfWidth = 10, halfDepth = 8) =>
    ({ projectId, halfWidth, halfDepth });

  it("leaves a single project at the origin", () => {
    expect(placeCompounds([footprint("p1")])).toEqual([{ projectId: "p1", offset: [0, 0] }]);
  });

  it("separates two compounds by their widths plus the gap", () => {
    const [left, right] = placeCompounds([footprint("p1"), footprint("p2")]);
    expect(right.offset[0] - left.offset[0]).toBe(20 + COMPOUND_GAP);
    expect(left.offset[1]).toBe(right.offset[1]);
  });

  it("wraps into a grid rather than one long row", () => {
    // Six compounds in a line push the overview camera so far back that none of
    // them can be read.
    const placements = placeCompounds(Array.from({ length: 6 }, (_, index) => footprint(`p${index}`)));
    const rows = new Set(placements.map((placement) => placement.offset[1]));
    expect(rows.size).toBeGreaterThan(1);
    expect(placements).toHaveLength(6);
  });

  it("never overlaps two compounds, whatever their sizes", () => {
    const sizes = [
      footprint("p1", 14, 6),
      footprint("p2", 6, 12),
      footprint("p3", 9, 9),
      footprint("p4", 20, 7),
      footprint("p5", 5, 5),
    ];
    const placements = placeCompounds(sizes);
    const byId = new Map(sizes.map((size) => [size.projectId, size]));
    for (const first of placements) {
      for (const second of placements) {
        if (first.projectId === second.projectId) continue;
        const a = byId.get(first.projectId)!;
        const b = byId.get(second.projectId)!;
        const apart =
          Math.abs(first.offset[0] - second.offset[0]) >= a.halfWidth + b.halfWidth ||
          Math.abs(first.offset[1] - second.offset[1]) >= a.halfDepth + b.halfDepth;
        expect(apart).toBe(true);
      }
    }
  });

  it("places the same set the same way every time", () => {
    const sizes = [footprint("p1", 11, 7), footprint("p2", 8, 9), footprint("p3", 13, 6)];
    expect(placeCompounds(sizes)).toEqual(placeCompounds(sizes));
  });
});
