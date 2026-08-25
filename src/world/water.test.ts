import { describe, expect, it } from "vitest";
import { compoundBounds, compoundGates, districtPaths } from "./compound";
import { zonePositions } from "./layout";
import { WATER_BANK_WIDTH, pointClearOfWater, waterBankOutline, waterBodies, waterOutline } from "./water";
import { worldZones } from "./zones";

const zones = worldZones([32.2, 9.4]);
const positions = zonePositions(zones);
const bounds = compoundBounds(zones, positions);
const gates = compoundGates(bounds);
const paths = districtPaths(zones, positions, gates, bounds);
const bodies = waterBodies(bounds, zones, positions, paths);

describe("waterBodies", () => {
  it("puts water both inside the walls and out in the meadow", () => {
    expect(bodies.some((body) => body.inside)).toBe(true);
    expect(bodies.some((body) => !body.inside)).toBe(true);
  });

  it("never floods a district", () => {
    for (const body of bodies) {
      for (const zone of zones) {
        const center = positions[zone.id];
        const overlapsX = Math.abs(body.center[0] - center[0]) < zone.size[0] / 2 + body.radius;
        const overlapsZ = Math.abs(body.center[1] - center[2]) < zone.size[1] / 2 + body.radius;
        expect(overlapsX && overlapsZ, `${body.id} floods ${zone.id}`).toBe(false);
      }
    }
  });

  it("never floods a road", () => {
    for (const body of bodies) {
      for (const path of paths) {
        const overlapsX = Math.abs(body.center[0] - path.center[0]) < path.size[0] / 2 + body.radius;
        const overlapsZ = Math.abs(body.center[1] - path.center[1]) < path.size[1] / 2 + body.radius;
        expect(overlapsX && overlapsZ, `${body.id} floods ${path.id}`).toBe(false);
      }
    }
  });

  it("keeps every body clear of the wall on whichever side it sits", () => {
    for (const body of bodies) {
      const insideEdge = body.center[0] - body.radius > bounds.minX
        && body.center[0] + body.radius < bounds.maxX
        && body.center[1] - body.radius > bounds.minZ
        && body.center[1] + body.radius < bounds.maxZ;
      const outsideEdge = body.center[0] + body.radius < bounds.minX
        || body.center[0] - body.radius > bounds.maxX
        || body.center[1] + body.radius < bounds.minZ
        || body.center[1] - body.radius > bounds.maxZ;
      expect(insideEdge || outsideEdge, `${body.id} crosses the wall`).toBe(true);
      expect(insideEdge).toBe(body.inside);
    }
  });

  it("never overlaps another body", () => {
    for (let first = 0; first < bodies.length; first += 1) {
      for (let second = first + 1; second < bodies.length; second += 1) {
        const distance = Math.hypot(
          bodies[first].center[0] - bodies[second].center[0],
          bodies[first].center[1] - bodies[second].center[1],
        );
        expect(distance).toBeGreaterThan(bodies[first].radius + bodies[second].radius);
      }
    }
  });

  it("is deterministic for the same world", () => {
    expect(waterBodies(bounds, zones, positions, paths)).toEqual(bodies);
  });

  it("keeps the count bounded so the meadow does not become a lake district", () => {
    expect(bodies.filter((body) => body.inside).length).toBeLessThanOrEqual(3);
    expect(bodies.filter((body) => !body.inside).length).toBeLessThanOrEqual(6);
  });

  it("adapts to a differently sized world", () => {
    const wide = worldZones([43.2, 9.4]);
    const widePositions = zonePositions(wide);
    const wideBounds = compoundBounds(wide, widePositions);
    const widePaths = districtPaths(wide, widePositions, compoundGates(wideBounds), wideBounds);
    expect(waterBodies(wideBounds, wide, widePositions, widePaths).length).toBeGreaterThan(0);
  });
});

describe("pointClearOfWater", () => {
  it("keeps scattered props out of the water", () => {
    const body = bodies[0];
    expect(pointClearOfWater(bodies, body.center[0], body.center[1])).toBe(false);
    expect(pointClearOfWater(bodies, body.center[0] + body.radius + 2, body.center[1])).toBe(true);
  });
});

describe("waterOutline", () => {
  it("is irregular rather than a circle", () => {
    const outline = waterOutline(bodies[0]);
    const radii = outline.map(([x, z]) => Math.hypot(x, z));
    expect(Math.max(...radii) - Math.min(...radii)).toBeGreaterThan(0.2);
  });

  it("never reaches past the radius the placement rules cleared", () => {
    for (const body of bodies) {
      for (const [x, z] of waterOutline(body)) {
        expect(Math.hypot(x, z)).toBeLessThanOrEqual(body.radius + 0.000001);
      }
    }
  });

  it("keeps the bank inside the tightest clearance the placement rules use", () => {
    for (const body of bodies) {
      for (const [x, z] of waterBankOutline(body)) {
        expect(Math.hypot(x, z)).toBeLessThanOrEqual(body.radius + WATER_BANK_WIDTH + 0.000001);
      }
    }
    // The tightest clearance around any water body is the 0.6 kept from a road.
    expect(WATER_BANK_WIDTH).toBeLessThan(0.6);
  });

  it("closes without a spike between the last point and the first", () => {
    const outline = waterOutline(bodies[0]);
    const step = Math.hypot(outline[0][0] - outline[1][0], outline[0][1] - outline[1][1]);
    const wrap = Math.hypot(
      outline[0][0] - outline[outline.length - 1][0],
      outline[0][1] - outline[outline.length - 1][1],
    );
    expect(wrap).toBeLessThan(step * 2);
  });

  it("gives two different bodies different shapes", () => {
    const first = waterOutline(bodies[0]).map(([x, z]) => Math.hypot(x, z) / bodies[0].radius);
    const other = bodies.find((body) => body.seed !== bodies[0].seed)!;
    const second = waterOutline(other).map(([x, z]) => Math.hypot(x, z) / other.radius);
    expect(first).not.toEqual(second);
  });

  it("is stable for the same body", () => {
    expect(waterOutline(bodies[0])).toEqual(waterOutline(bodies[0]));
  });
});
