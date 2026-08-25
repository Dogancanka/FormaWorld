import type { WorldZone } from "./zones";
import type { ZonePositions } from "./layout";

// The world is one walled compound resting on a single continuous ground plane.
// Every piece of the enclosure is derived from the districts it has to contain,
// so a district that grows or is moved in Edit layout can never end up outside
// the wall and no wall geometry has to be hand-placed per project.

export interface CompoundBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export type CompoundSide = "north" | "south" | "east" | "west";

export interface CompoundGate {
  id: string;
  side: CompoundSide;
  /** Centre of the opening along the free axis of its side. */
  center: number;
  width: number;
}

export interface WallRun {
  id: string;
  side: CompoundSide;
  /** Ground-plane centre of the run as [x, z]. */
  center: [number, number];
  length: number;
}

export interface GroundPath {
  id: string;
  /** Ground-plane centre of the flat dirt rectangle as [x, z]. */
  center: [number, number];
  size: [number, number];
}

export const WALL_THICKNESS = 0.56;
export const WALL_HEIGHT = 1.5;
export const GATE_WIDTH = 3.2;
export const TOWER_SIZE = 1.55;

// Open ground between the outermost district and the wall. Too little of it and
// the wall crowds the issue yard and the material yard.
const BOUNDS_PADDING = 2.6;
const BOUNDS_STEP = 2;
const MIN_SPAN_X = 20;
const MIN_SPAN_Z = 18;
const PATH_WIDTH = 0.9;
const GATE_ROAD_WIDTH = 1.5;
/** A road stops this far outside a district edge, never on the district. */
const PATH_CLEARANCE = 0.12;
function floorTo(value: number, step: number): number {
  return Math.floor(value / step) * step;
}

function ceilTo(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}

/** Widens a span symmetrically until it reaches the minimum enclosure size. */
function atLeast(minimum: number, maximum: number, span: number): [number, number] {
  const missing = span - (maximum - minimum);
  if (missing <= 0) return [minimum, maximum];
  return [minimum - missing / 2, maximum + missing / 2];
}

/**
 * The wall rectangle for the districts currently represented. Bounds are
 * quantised so ordinary content growth or a small district move does not make
 * the enclosure breathe on every reconciliation.
 */
export function compoundBounds(zones: WorldZone[], positions: ZonePositions): CompoundBounds {
  let contentMinX = Number.POSITIVE_INFINITY;
  let contentMaxX = Number.NEGATIVE_INFINITY;
  let contentMinZ = Number.POSITIVE_INFINITY;
  let contentMaxZ = Number.NEGATIVE_INFINITY;

  for (const zone of zones) {
    const position = positions[zone.id];
    if (!position) continue;
    contentMinX = Math.min(contentMinX, position[0] - zone.size[0] / 2);
    contentMaxX = Math.max(contentMaxX, position[0] + zone.size[0] / 2);
    contentMinZ = Math.min(contentMinZ, position[2] - zone.size[1] / 2);
    contentMaxZ = Math.max(contentMaxZ, position[2] + zone.size[1] / 2);
  }

  if (!Number.isFinite(contentMinX) || !Number.isFinite(contentMinZ)) {
    return { minX: -MIN_SPAN_X / 2, maxX: MIN_SPAN_X / 2, minZ: -MIN_SPAN_Z / 2, maxZ: MIN_SPAN_Z / 2 };
  }

  // Each edge is quantised on its own so an off-centre city does not pay for its
  // asymmetry with a wall twice the size it needs.
  const [minX, maxX] = atLeast(
    floorTo(contentMinX - BOUNDS_PADDING, BOUNDS_STEP),
    ceilTo(contentMaxX + BOUNDS_PADDING, BOUNDS_STEP),
    MIN_SPAN_X,
  );
  const [minZ, maxZ] = atLeast(
    floorTo(contentMinZ - BOUNDS_PADDING, BOUNDS_STEP),
    ceilTo(contentMaxZ + BOUNDS_PADDING, BOUNDS_STEP),
    MIN_SPAN_Z,
  );
  return { minX, maxX, minZ, maxZ };
}

export function compoundCenter(bounds: CompoundBounds): [number, number] {
  return [(bounds.minX + bounds.maxX) / 2, (bounds.minZ + bounds.maxZ) / 2];
}

export function compoundCorners(bounds: CompoundBounds): [number, number][] {
  return [
    [bounds.minX, bounds.minZ],
    [bounds.maxX, bounds.minZ],
    [bounds.minX, bounds.maxZ],
    [bounds.maxX, bounds.maxZ],
  ];
}

/** One main gate facing the default camera and one service gate on the west wall. */
export function compoundGates(bounds: CompoundBounds): CompoundGate[] {
  const [centerX, centerZ] = compoundCenter(bounds);
  return [
    { id: "main", side: "south", center: centerX, width: GATE_WIDTH },
    { id: "service", side: "west", center: centerZ, width: GATE_WIDTH * 0.75 },
  ];
}

export function gateMouth(gate: CompoundGate, bounds: CompoundBounds): [number, number] {
  switch (gate.side) {
    case "north": return [gate.center, bounds.minZ];
    case "south": return [gate.center, bounds.maxZ];
    case "west": return [bounds.minX, gate.center];
    case "east": return [bounds.maxX, gate.center];
  }
}

function subtractGaps(from: number, to: number, gaps: [number, number][]): [number, number][] {
  let spans: [number, number][] = [[from, to]];
  for (const [gapStart, gapEnd] of gaps) {
    const next: [number, number][] = [];
    for (const [start, end] of spans) {
      if (gapEnd <= start || gapStart >= end) {
        next.push([start, end]);
        continue;
      }
      if (gapStart > start) next.push([start, gapStart]);
      if (gapEnd < end) next.push([gapEnd, end]);
    }
    spans = next;
  }
  return spans.filter(([start, end]) => end - start > 0.001);
}

/**
 * The continuous enclosure, split only where a gate opens it. North/south runs
 * carry the corners; east/west runs are inset by half the wall thickness so the
 * two directions meet instead of overlapping inside the corner towers.
 */
export function wallRuns(bounds: CompoundBounds, gates: CompoundGate[]): WallRun[] {
  const sides: { side: CompoundSide; from: number; to: number; fixed: number }[] = [
    { side: "north", from: bounds.minX, to: bounds.maxX, fixed: bounds.minZ },
    { side: "south", from: bounds.minX, to: bounds.maxX, fixed: bounds.maxZ },
    { side: "west", from: bounds.minZ + WALL_THICKNESS / 2, to: bounds.maxZ - WALL_THICKNESS / 2, fixed: bounds.minX },
    { side: "east", from: bounds.minZ + WALL_THICKNESS / 2, to: bounds.maxZ - WALL_THICKNESS / 2, fixed: bounds.maxX },
  ];

  const runs: WallRun[] = [];
  for (const { side, from, to, fixed } of sides) {
    const gaps = gates
      .filter((gate) => gate.side === side)
      .map((gate): [number, number] => [gate.center - gate.width / 2, gate.center + gate.width / 2]);
    subtractGaps(from, to, gaps).forEach(([start, end], index) => {
      const middle = (start + end) / 2;
      runs.push({
        id: `${side}-${index}`,
        side,
        center: side === "north" || side === "south" ? [middle, fixed] : [fixed, middle],
        length: end - start,
      });
    });
  }
  return runs;
}

export function wallRunIsAlongX(run: WallRun): boolean {
  return run.side === "north" || run.side === "south";
}

interface PathSegment {
  axis: "x" | "z";
  /** Coordinate on the axis the segment does not run along. */
  fixed: number;
  from: number;
  to: number;
  width: number;
}

interface ZoneRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function zoneRect(zone: WorldZone, position: [number, number, number], margin: number): ZoneRect {
  return {
    minX: position[0] - zone.size[0] / 2 - margin,
    maxX: position[0] + zone.size[0] / 2 + margin,
    minZ: position[2] - zone.size[1] / 2 - margin,
    maxZ: position[2] + zone.size[1] / 2 + margin,
  };
}

/** The span of a segment that lies inside a district rectangle, if any. */
function overlapSpan(segment: PathSegment, rect: ZoneRect): [number, number] | undefined {
  const half = segment.width / 2;
  if (segment.axis === "x") {
    if (segment.fixed + half <= rect.minZ || segment.fixed - half >= rect.maxZ) return undefined;
    return [rect.minX, rect.maxX];
  }
  if (segment.fixed + half <= rect.minX || segment.fixed - half >= rect.maxX) return undefined;
  return [rect.minZ, rect.maxZ];
}

function segmentLengthInside(segment: PathSegment, rects: ZoneRect[]): number {
  const start = Math.min(segment.from, segment.to);
  const end = Math.max(segment.from, segment.to);
  let inside = 0;
  for (const rect of rects) {
    const span = overlapSpan(segment, rect);
    if (!span) continue;
    inside += Math.max(0, Math.min(end, span[1]) - Math.max(start, span[0]));
  }
  return inside;
}

/** Splits a segment so none of it lies on a district. */
function clipSegment(segment: PathSegment, rects: ZoneRect[]): PathSegment[] {
  const start = Math.min(segment.from, segment.to);
  const end = Math.max(segment.from, segment.to);
  const gaps = rects
    .map((rect) => overlapSpan(segment, rect))
    .filter((span): span is [number, number] => Boolean(span));
  return subtractGaps(start, end, gaps)
    .filter(([spanStart, spanEnd]) => spanEnd - spanStart > 0.05)
    .map(([spanStart, spanEnd]) => ({ ...segment, from: spanStart, to: spanEnd }));
}

function elbow(origin: [number, number], target: [number, number], width: number, xFirst: boolean): PathSegment[] {
  const corner: [number, number] = xFirst ? [target[0], origin[1]] : [origin[0], target[1]];
  const segments: PathSegment[] = [];
  if (Math.abs(corner[0] - origin[0]) > 0.001 || Math.abs(target[0] - corner[0]) > 0.001) {
    const alongX = xFirst
      ? { from: origin[0], to: corner[0], fixed: origin[1] }
      : { from: corner[0], to: target[0], fixed: target[1] };
    if (Math.abs(alongX.to - alongX.from) > 0.001) segments.push({ axis: "x", width, ...alongX });
  }
  const alongZ = xFirst
    ? { from: corner[1], to: target[1], fixed: target[0] }
    : { from: origin[1], to: corner[1], fixed: origin[0] };
  if (Math.abs(alongZ.to - alongZ.from) > 0.001) segments.push({ axis: "z", width, ...alongZ });
  return segments;
}

/**
 * Roads to different districts share long stretches. Drawing those stretches
 * twice puts two dirt rectangles on the same ground at slightly different
 * heights, which reads as a patchwork of blocks rather than one road, so
 * collinear runs of the same width are merged into a single surface first.
 */
function mergeSegments(segments: PathSegment[]): PathSegment[] {
  const lanes = new Map<string, PathSegment[]>();
  for (const segment of segments) {
    const key = `${segment.axis}:${segment.fixed.toFixed(3)}:${segment.width.toFixed(3)}`;
    lanes.set(key, [...(lanes.get(key) ?? []), segment]);
  }
  const merged: PathSegment[] = [];
  for (const lane of lanes.values()) {
    const spans = lane
      .map((segment): [number, number] => [Math.min(segment.from, segment.to), Math.max(segment.from, segment.to)])
      .sort((left, right) => left[0] - right[0]);
    let current = spans[0];
    for (const span of spans.slice(1)) {
      if (span[0] <= current[1] + 0.001) {
        current = [current[0], Math.max(current[1], span[1])];
      } else {
        merged.push({ ...lane[0], from: current[0], to: current[1] });
        current = span;
      }
    }
    merged.push({ ...lane[0], from: current[0], to: current[1] });
  }
  return merged;
}

function toPath(id: string, segment: PathSegment): GroundPath {
  const middle = (segment.from + segment.to) / 2;
  const length = Math.abs(segment.to - segment.from);
  return segment.axis === "x"
    ? { id, center: [middle, segment.fixed], size: [length, segment.width] }
    : { id, center: [segment.fixed, middle], size: [segment.width, length] };
}

/**
 * Flat dirt roads laid on the ground plane: one connection from the central
 * Project district to every other district, plus an approach road to each gate.
 *
 * A road never runs onto a district. Of the two right-angled routes to a target,
 * the one crossing the least district ground is chosen, and whatever still
 * touches a district is clipped away at its edge — so a road stops at the kerb
 * instead of cutting through the yard behind it.
 *
 * Roads are civic layout only. They follow the current district centres and
 * never encode a relationship between two districts.
 */
export function districtPaths(
  zones: WorldZone[],
  positions: ZonePositions,
  gates: CompoundGate[],
  bounds: CompoundBounds,
): GroundPath[] {
  const hub = positions.hub ?? [0, 0, 0];
  const origin: [number, number] = [hub[0], hub[2]];
  const rects = zones
    .filter((zone) => positions[zone.id])
    .map((zone) => zoneRect(zone, positions[zone.id], PATH_CLEARANCE));
  const routed: PathSegment[] = [];

  const addRoute = (target: [number, number], width: number) => {
    const candidates = [elbow(origin, target, width, true), elbow(origin, target, width, false)];
    const best = candidates.reduce((chosen, candidate) => {
      const cost = candidate.reduce((total, segment) => total + segmentLengthInside(segment, rects), 0);
      return cost < chosen.cost ? { segments: candidate, cost } : chosen;
    }, { segments: candidates[0], cost: Number.POSITIVE_INFINITY }).segments;
    routed.push(...best.flatMap((segment) => clipSegment(segment, rects)));
  };

  for (const zone of zones) {
    if (zone.id === "hub") continue;
    const position = positions[zone.id];
    if (!position) continue;
    addRoute([position[0], position[2]], PATH_WIDTH);
  }
  for (const gate of gates) {
    addRoute(gateMouth(gate, bounds), GATE_ROAD_WIDTH);
  }

  // Routes share long stretches, so the drawn surfaces are the merged lanes
  // rather than one rectangle per route.
  return mergeSegments(routed)
    .map((segment, index) => toPath(`road-${index}`, segment));
}

export function pointClearOfPaths(paths: GroundPath[], x: number, z: number, clearance = 0.5): boolean {
  return paths.every((path) => Math.abs(x - path.center[0]) > path.size[0] / 2 + clearance
    || Math.abs(z - path.center[1]) > path.size[1] / 2 + clearance);
}
