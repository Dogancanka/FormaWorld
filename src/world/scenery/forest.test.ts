import { describe, expect, it } from "vitest";
import type { CompoundRect } from "../water";
import { groupByKind, plantForest } from "./forest";

const left: CompoundRect = { minX: -46, maxX: -4, minZ: -20, maxZ: 20 };
const right: CompoundRect = { minX: 4, maxX: 46, minZ: -20, maxZ: 20 };
const compounds = [left, right];

const forest = plantForest({ compounds, water: [] });

function inside(rect: CompoundRect, x: number, z: number): boolean {
  return x > rect.minX && x < rect.maxX && z > rect.minZ && z < rect.maxZ;
}

describe("plantForest", () => {
  it("fills the open ground rather than sprinkling it", () => {
    // The wood exists to stop the world looking bare, so a handful of trees is
    // a failure just as surely as a tree inside a compound is.
    expect(forest.length).toBeGreaterThan(400);
  });

  it("never grows on a compound", () => {
    for (const plant of forest) {
      for (const [name, rect] of [["left", left], ["right", right]] as const) {
        expect(inside(rect, plant.x, plant.z), `${name} has a ${plant.kind} on it`).toBe(false);
      }
    }
  });

  it("never grows in the water", () => {
    const water = [{ center: [0, 40] as [number, number], radius: 6 }];
    const wet = plantForest({ compounds, water })
      .filter((plant) => Math.hypot(plant.x - 0, plant.z - 40) < 6);
    expect(wet).toEqual([]);
  });

  it("is mostly trees, with bushes and rock for relief", () => {
    const grouped = groupByKind(forest);
    expect(grouped.pine.length).toBeGreaterThan(grouped.bush.length);
    expect(grouped.bush.length).toBeGreaterThan(0);
    expect(grouped.rock.length).toBeGreaterThan(0);
  });

  it("clumps into stands instead of spreading evenly", () => {
    // A uniform scatter reads as wallpaper. Measured as the spread of how many
    // plants land in each cell of a coarse grid: an even sprinkle would put
    // nearly the same count in every cell.
    const cells = new Map<string, number>();
    for (const plant of forest) {
      const key = `${Math.floor(plant.x / 12)}:${Math.floor(plant.z / 12)}`;
      cells.set(key, (cells.get(key) ?? 0) + 1);
    }
    const counts = [...cells.values()];
    const mean = counts.reduce((sum, count) => sum + count, 0) / counts.length;
    const variance = counts.reduce((sum, count) => sum + (count - mean) ** 2, 0) / counts.length;
    expect(Math.sqrt(variance) / mean).toBeGreaterThan(0.35);
  });

  it("stays within its limit however large the world", () => {
    const wide = plantForest({
      compounds: [{ minX: -400, maxX: 400, minZ: -400, maxZ: 400 }],
      water: [],
      limit: 900,
    });
    expect(wide.length).toBeLessThanOrEqual(900);
  });

  it("plants the same wood twice for the same world", () => {
    expect(plantForest({ compounds, water: [] })).toEqual(forest);
  });
});
