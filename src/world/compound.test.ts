import { describe, expect, it } from "vitest";
import {
  compoundBounds,
  compoundGates,
  districtPaths,
  gateMouth,
  wallRunIsAlongX,
  wallRuns,
  WALL_THICKNESS,
} from "./compound";
import { zonePositions } from "./layout";
import { worldZones } from "./zones";

const WORLD_ZONES = worldZones([24, 9.4]);
const positions = zonePositions(WORLD_ZONES);

describe("compoundBounds", () => {
  it("encloses every district footprint with clearance on all four sides", () => {
    const bounds = compoundBounds(WORLD_ZONES, positions);
    for (const zone of WORLD_ZONES) {
      const position = positions[zone.id];
      expect(position[0] - zone.size[0] / 2).toBeGreaterThan(bounds.minX);
      expect(position[0] + zone.size[0] / 2).toBeLessThan(bounds.maxX);
      expect(position[2] - zone.size[1] / 2).toBeGreaterThan(bounds.minZ);
      expect(position[2] + zone.size[1] / 2).toBeLessThan(bounds.maxZ);
    }
  });

  it("grows the enclosure when a district footprint grows", () => {
    const bounds = compoundBounds(WORLD_ZONES, positions);
    const grown = WORLD_ZONES.map((zone) => zone.id === "issues"
      ? { ...zone, size: [zone.size[0] + 10, zone.size[1] + 10] as [number, number] }
      : zone);
    const grownBounds = compoundBounds(grown, positions);
    expect(grownBounds.maxX - grownBounds.minX).toBeGreaterThan(bounds.maxX - bounds.minX);
  });

  it("keeps a minimum enclosure for an empty world", () => {
    const bounds = compoundBounds([], positions);
    expect(bounds.maxX - bounds.minX).toBeGreaterThan(0);
    expect(bounds.maxZ - bounds.minZ).toBeGreaterThan(0);
  });
});

describe("wallRuns", () => {
  it("leaves exactly one opening per gate and no wall inside it", () => {
    const bounds = compoundBounds(WORLD_ZONES, positions);
    const gates = compoundGates(bounds);
    const runs = wallRuns(bounds, gates);

    for (const gate of gates) {
      const sideRuns = runs.filter((run) => run.side === gate.side);
      expect(sideRuns).toHaveLength(2);
      for (const run of sideRuns) {
        const axisCenter = wallRunIsAlongX(run) ? run.center[0] : run.center[1];
        const start = axisCenter - run.length / 2;
        const end = axisCenter + run.length / 2;
        const beforeGate = end <= gate.center - gate.width / 2 + 0.001;
        const afterGate = start >= gate.center + gate.width / 2 - 0.001;
        expect(beforeGate || afterGate).toBe(true);
      }
    }
  });

  it("covers the whole perimeter apart from the gate openings", () => {
    const bounds = compoundBounds(WORLD_ZONES, positions);
    const gates = compoundGates(bounds);
    const runs = wallRuns(bounds, gates);
    const width = bounds.maxX - bounds.minX;
    const depth = bounds.maxZ - bounds.minZ - WALL_THICKNESS;
    const perimeter = 2 * width + 2 * depth;
    const covered = runs.reduce((total, run) => total + run.length, 0);
    const openings = gates.reduce((total, gate) => total + gate.width, 0);
    expect(covered).toBeCloseTo(perimeter - openings, 5);
  });

  it("places every gate mouth on its own side of the enclosure", () => {
    const bounds = compoundBounds(WORLD_ZONES, positions);
    for (const gate of compoundGates(bounds)) {
      const [x, z] = gateMouth(gate, bounds);
      if (gate.side === "south") expect(z).toBe(bounds.maxZ);
      if (gate.side === "west") expect(x).toBe(bounds.minX);
      expect(x).toBeGreaterThanOrEqual(bounds.minX);
      expect(x).toBeLessThanOrEqual(bounds.maxX);
    }
  });
});

describe("districtPaths", () => {
  const bounds = compoundBounds(WORLD_ZONES, positions);
  const gates = compoundGates(bounds);
  const paths = districtPaths(WORLD_ZONES, positions, gates, bounds);

  /** True when a road surface touches the district's edge, within a step. */
  function reachedByRoad(zoneId: string, roads = paths): boolean {
    const zone = WORLD_ZONES.find((district) => district.id === zoneId)!;
    const center = positions[zoneId];
    return roads.some((path) => {
      const gapX = Math.abs(path.center[0] - center[0]) - (path.size[0] / 2 + zone.size[0] / 2);
      const gapZ = Math.abs(path.center[1] - center[2]) - (path.size[1] / 2 + zone.size[1] / 2);
      return gapX < 0.5 && gapZ < 0.5;
    });
  }

  it("brings a road up to every district", () => {
    for (const zone of WORLD_ZONES) {
      if (zone.id === "hub") continue;
      expect(reachedByRoad(zone.id), `${zone.id} has no road`).toBe(true);
    }
  });

  it("brings a road up to every gate", () => {
    for (const gate of gates) {
      const [x, z] = gateMouth(gate, bounds);
      const reaches = paths.some((path) => Math.abs(path.center[0] - x) <= path.size[0] / 2 + 0.6
        && Math.abs(path.center[1] - z) <= path.size[1] / 2 + 0.6);
      expect(reaches, `gate ${gate.id} has no approach road`).toBe(true);
    }
  });

  it("never lays road surface on a district", () => {
    for (const path of paths) {
      for (const zone of WORLD_ZONES) {
        const center = positions[zone.id];
        const overlapsX = Math.abs(path.center[0] - center[0]) < path.size[0] / 2 + zone.size[0] / 2;
        const overlapsZ = Math.abs(path.center[1] - center[2]) < path.size[1] / 2 + zone.size[1] / 2;
        expect(overlapsX && overlapsZ, `${path.id} runs onto ${zone.id}`).toBe(false);
      }
    }
  });

  it("draws each shared stretch once instead of stacking rectangles", () => {
    for (let first = 0; first < paths.length; first += 1) {
      for (let second = first + 1; second < paths.length; second += 1) {
        const left = paths[first];
        const right = paths[second];
        const sameLane = left.size[1] === right.size[1] && Math.abs(left.center[1] - right.center[1]) < 0.001
          && left.size[0] > left.size[1] && right.size[0] > right.size[1];
        if (!sameLane) continue;
        const apart = Math.abs(left.center[0] - right.center[0]) >= (left.size[0] + right.size[0]) / 2 - 0.001;
        expect(apart, `${left.id} and ${right.id} overlap in the same lane`).toBe(true);
      }
    }
  });

  it("lays no road to a district that already sits on the hub", () => {
    const stacked = { ...positions, forms: [...positions.hub] as [number, number, number] };
    const stackedPaths = districtPaths(WORLD_ZONES, stacked, [], bounds);
    const formsZone = WORLD_ZONES.find((zone) => zone.id === "forms")!;
    const onForms = stackedPaths.some((path) => Math.abs(path.center[0] - stacked.forms[0]) < path.size[0] / 2 + formsZone.size[0] / 2
      && Math.abs(path.center[1] - stacked.forms[2]) < path.size[1] / 2 + formsZone.size[1] / 2);
    expect(onForms).toBe(false);
  });
});
