import { describe, expect, it } from "vitest";
import { compoundBounds, compoundGates, districtPaths } from "./compound";
import { zonePositions } from "./layout";
import { WATER_BANK_WIDTH, openWater, pointClearOfWater, waterBankOutline, waterBodies, waterOutline, riverCourses, type CompoundRect } from "./water";
import { worldZones } from "./zones";

const zones = worldZones([32.2, 9.4]);
const positions = zonePositions(zones);
const bounds = compoundBounds(zones, positions);
const gates = compoundGates(bounds);
const paths = districtPaths(zones, positions, gates, bounds);
const bodies = waterBodies(bounds, zones, positions, paths);

describe("waterBodies", () => {
  it("puts ponds inside the walls and leaves the meadow to the world", () => {
    // Open water is laid out once for the whole world by `openWater`. A
    // compound scattering past its own wall could not see the compound standing
    // next door, and put lakes across its wall and districts.
    expect(bodies.some((body) => body.inside)).toBe(true);
    expect(bodies.every((body) => body.inside)).toBe(true);
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

describe("openWater", () => {
  // Two compounds laid out the way placeCompounds arranges them: side by side
  // with a gap of open ground between.
  const left: CompoundRect = { minX: -46, maxX: -4, minZ: -20, maxZ: 20 };
  const right: CompoundRect = { minX: 4, maxX: 46, minZ: -20, maxZ: 20 };
  const below: CompoundRect = { minX: -46, maxX: -4, minZ: 30, maxZ: 70 };
  const world = openWater([left, right, below]);

  function touches(rect: CompoundRect, body: { center: [number, number]; radius: number }): boolean {
    return body.center[0] + body.radius > rect.minX
      && body.center[0] - body.radius < rect.maxX
      && body.center[1] + body.radius > rect.minZ
      && body.center[1] - body.radius < rect.maxZ;
  }

  it("never reaches any compound in the world", () => {
    // The rule. A pond that crosses a wall floods districts belonging to a
    // project the pond knows nothing about.
    for (const body of world) {
      for (const [name, rect] of [["left", left], ["right", right], ["below", below]] as const) {
        expect(touches(rect, body), `${body.id} reaches the ${name} compound`).toBe(false);
      }
    }
  });

  it("still fills the meadow with something", () => {
    expect(world.length).toBeGreaterThan(0);
    expect(world.every((body) => !body.inside)).toBe(true);
  });

  it("never overlaps another body", () => {
    for (const first of world) {
      for (const second of world) {
        if (first.id === second.id) continue;
        const distance = Math.hypot(first.center[0] - second.center[0], first.center[1] - second.center[1]);
        expect(distance, `${first.id} overlaps ${second.id}`).toBeGreaterThan(first.radius + second.radius);
      }
    }
  });

  it("is deterministic, so a growing district never moves the lakes", () => {
    expect(openWater([left, right, below])).toEqual(world);
  });

  it("says nothing about a world with no compounds", () => {
    expect(openWater([])).toEqual([]);
  });

  it("gives the world one lake and only a few ponds", () => {
    // Two dozen blobs of roughly equal size read as a rash rather than water.
    expect(world.length).toBeLessThanOrEqual(5);
    const lake = world.find((body) => body.id === "lake");
    expect(lake).toBeDefined();
    for (const body of world) {
      if (body.id === "lake") continue;
      expect(body.radius).toBeLessThan(lake!.radius);
    }
  });

  it("puts the lake a little way out, not off in the fog", () => {
    // Far enough from a wall not to crowd a project, near enough to still be
    // part of the view. Taking the furthest candidate hid it in the haze.
    const lake = world.find((body) => body.id === "lake")!;
    const nearest = Math.min(...[left, right, below].map((rect) => {
      const dx = Math.max(rect.minX - lake.center[0], 0, lake.center[0] - rect.maxX);
      const dz = Math.max(rect.minZ - lake.center[1], 0, lake.center[1] - rect.maxZ);
      return Math.hypot(dx, dz);
    }));
    expect(nearest).toBeGreaterThan(lake.radius);
    expect(nearest).toBeLessThan(40);
  });
});

describe("riverCourses", () => {
  const left: CompoundRect = { minX: -46, maxX: -4, minZ: -20, maxZ: 20 };
  const right: CompoundRect = { minX: 4, maxX: 46, minZ: -20, maxZ: 20 };
  const below: CompoundRect = { minX: -46, maxX: -4, minZ: 34, maxZ: 74 };
  const rivers = riverCourses([left, right, below]);

  it("cuts exactly one course across the world", () => {
    // Two rivers put a crossroads of water through the middle of the world.
    // Rivers do not cross.
    expect(rivers).toHaveLength(1);
    for (const river of rivers) {
      expect(river.points.length).toBeGreaterThan(10);
      expect(river.halfWidth).toBeGreaterThan(0);
    }
  });

  it("never runs through a compound", () => {
    // Routed down a lane the compounds leave free, with the meander clamped
    // inside it, so this holds by construction rather than by luck.
    for (const river of rivers) {
      for (const [x, z] of river.points) {
        for (const [name, rect] of [["left", left], ["right", right], ["below", below]] as const) {
          const hits = x + river.halfWidth > rect.minX && x - river.halfWidth < rect.maxX
            && z + river.halfWidth > rect.minZ && z - river.halfWidth < rect.maxZ;
          expect(hits, `${river.id} runs through the ${name} compound`).toBe(false);
        }
      }
    }
  });

  it("meanders rather than running dead straight", () => {
    const river = rivers[0];
    const offsets = river.points.map(([, z]) => z);
    expect(Math.max(...offsets) - Math.min(...offsets)).toBeGreaterThan(0);
  });

  it("says nothing about a world with no compounds", () => {
    expect(riverCourses([])).toEqual([]);
  });

  it("cuts the same course every time", () => {
    expect(riverCourses([left, right, below])).toEqual(rivers);
  });
});
