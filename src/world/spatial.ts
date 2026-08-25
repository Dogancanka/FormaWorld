import type { WorldZone, ZoneId } from "./zones";

export interface PositionedZone extends Pick<WorldZone, "id" | "size"> {
  position: [number, number, number];
}

export function containsWorldPoint(
  zone: PositionedZone,
  point: [number, number, number],
): boolean {
  const halfWidth = zone.size[0] / 2;
  const halfDepth = zone.size[1] / 2;
  return Math.abs(point[0] - zone.position[0]) <= halfWidth
    && Math.abs(point[2] - zone.position[2]) <= halfDepth;
}

export function findDropZone(
  zones: PositionedZone[],
  point: [number, number, number],
): ZoneId | undefined {
  return zones.find((zone) => containsWorldPoint(zone, point))?.id;
}

export function segmentIntersectsZone(
  start: [number, number, number],
  end: [number, number, number],
  zone: PositionedZone,
  clearance = 0.25,
): boolean {
  const minimum = [zone.position[0] - zone.size[0] / 2 - clearance, zone.position[2] - zone.size[1] / 2 - clearance];
  const maximum = [zone.position[0] + zone.size[0] / 2 + clearance, zone.position[2] + zone.size[1] / 2 + clearance];
  const origin = [start[0], start[2]];
  const delta = [end[0] - start[0], end[2] - start[2]];
  let entry = 0;
  let exit = 1;
  for (let axis = 0; axis < 2; axis += 1) {
    if (Math.abs(delta[axis]) < 0.000001) {
      if (origin[axis] < minimum[axis] || origin[axis] > maximum[axis]) return false;
      continue;
    }
    const first = (minimum[axis] - origin[axis]) / delta[axis];
    const second = (maximum[axis] - origin[axis]) / delta[axis];
    entry = Math.max(entry, Math.min(first, second));
    exit = Math.min(exit, Math.max(first, second));
    if (entry > exit) return false;
  }
  return true;
}
