import { describe, expect, it } from "vitest";
import { containsWorldPoint, findDropZone, segmentIntersectsZone, type PositionedZone } from "./spatial";

const warehouse: PositionedZone = {
  id: "assets",
  position: [-6, 0, 5],
  size: [4, 3],
};

describe("world drop zones", () => {
  it("recognizes a point inside a movable zone", () => {
    expect(containsWorldPoint(warehouse, [-5, 0, 5.5])).toBe(true);
    expect(findDropZone([warehouse], [-5, 0, 5.5])).toBe("assets");
  });

  it("does not assign points outside the tile", () => {
    expect(containsWorldPoint(warehouse, [0, 0, 0])).toBe(false);
    expect(findDropZone([warehouse], [0, 0, 0])).toBeUndefined();
  });

  it("detects when a moving actor's route crosses a district footprint", () => {
    expect(segmentIntersectsZone([-10, 0, 5], [2, 0, 5], warehouse)).toBe(true);
    expect(segmentIntersectsZone([-10, 0, 0], [2, 0, 0], warehouse)).toBe(false);
  });
});
