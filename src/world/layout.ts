import type { WorldZone, ZoneId } from "./zones";

export type ZonePositions = Record<ZoneId, [number, number, number]>;

// A district's place on the map comes from the district list itself. The core
// districts are fixed in every project world; the asset districts are derived
// from the project's own APS asset statuses, so their count varies per project
// while their arrangement stays deterministic.
export function zonePositions(zones: WorldZone[]): ZonePositions {
  return Object.fromEntries(zones.map((zone) => [zone.id, [...zone.position]])) as ZonePositions;
}

export function zonesOverlap(
  first: { size: [number, number] },
  firstPosition: [number, number, number],
  second: { size: [number, number] },
  secondPosition: [number, number, number],
  padding = 0.8,
): boolean {
  const minimumXDistance = (first.size[0] + second.size[0]) / 2 + padding;
  const minimumZDistance = (first.size[1] + second.size[1]) / 2 + padding;
  return Math.abs(firstPosition[0] - secondPosition[0]) < minimumXDistance
    && Math.abs(firstPosition[2] - secondPosition[2]) < minimumZDistance;
}
