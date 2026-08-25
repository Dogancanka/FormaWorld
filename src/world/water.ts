import type { CompoundBounds, GroundPath } from "./compound";
import type { ZonePositions } from "./layout";
import type { WorldZone } from "./zones";

/**
 * Ponds inside the walls and open water in the meadow around them. Water is
 * scenery: it is placed deterministically from the compound's own geometry, it
 * never touches a district, a road or the wall, and it takes no part in
 * picking.
 */
export interface WaterBody {
  id: string;
  center: [number, number];
  radius: number;
  /** True for a pond inside the walls, false for open water outside them. */
  inside: boolean;
  /** Deterministic seed for the shape's rotation and ripple phase. */
  seed: number;
}

// Clearances are tight on purpose: the ground inside the walls is nearly all
// district and road, and a generous margin leaves no room for a pond at all.
const DISTRICT_CLEARANCE = 0.8;
const PATH_CLEARANCE = 0.6;
/** Water never runs up to the wall, on either side of it. */
const WALL_CLEARANCE = 0.9;
const SAMPLE_STEP = 4.0;
const INSIDE_STEP = 1.5;
const INSIDE_RADIUS: [number, number] = [1.0, 1.7];
const OUTSIDE_RADIUS: [number, number] = [2.4, 4.2];
/**
 * One proper lake, and only a handful of ponds beside it.
 *
 * Two dozen blobs of roughly equal size read as a rash rather than as water.
 * A landscape wants one thing big enough to be a landmark and a few small ones
 * for company, so the first body kept is grown into a lake and the rest are
 * capped hard.
 */
const LAKE_RADIUS = 9.5;
const MAX_PONDS = 4;
/** How far from the nearest wall the lake wants to sit. */
const LAKE_STANDOFF = 22;
/** How far past the wall open water may still be placed. */
const OUTSIDE_REACH = 24;
const MAX_INSIDE = 3;

function hash(x: number, z: number): number {
  let value = 2166136261;
  for (const part of [Math.round(x * 10), Math.round(z * 10)]) {
    value ^= part & 0xff;
    value = Math.imul(value, 16777619);
    value ^= (part >> 8) & 0xff;
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function clearOfDistricts(zones: WorldZone[], positions: ZonePositions, x: number, z: number, radius: number): boolean {
  return zones.every((zone) => {
    const center = positions[zone.id];
    if (!center) return true;
    return Math.abs(x - center[0]) > zone.size[0] / 2 + radius + DISTRICT_CLEARANCE
      || Math.abs(z - center[2]) > zone.size[1] / 2 + radius + DISTRICT_CLEARANCE;
  });
}

function clearOfPaths(paths: GroundPath[], x: number, z: number, radius: number): boolean {
  return paths.every((path) => Math.abs(x - path.center[0]) > path.size[0] / 2 + radius + PATH_CLEARANCE
    || Math.abs(z - path.center[1]) > path.size[1] / 2 + radius + PATH_CLEARANCE);
}

function insideWall(bounds: CompoundBounds, x: number, z: number, inset: number): boolean {
  return x > bounds.minX + inset && x < bounds.maxX - inset
    && z > bounds.minZ + inset && z < bounds.maxZ - inset;
}

function scaled(range: [number, number], seed: number): number {
  return range[0] + ((seed >>> 7) % 100) / 100 * (range[1] - range[0]);
}

/**
 * Ponds inside one compound's walls.
 *
 * Open water is *not* placed here. A compound only knows its own geometry, and
 * scattering water past its own wall from inside that view is what put lakes
 * across a neighbour's wall and districts as soon as a world held more than one
 * project. The meadow between compounds belongs to the world, so `openWater`
 * lays it out once with every compound in view.
 */
export function waterBodies(
  bounds: CompoundBounds,
  zones: WorldZone[],
  positions: ZonePositions,
  paths: GroundPath[],
): WaterBody[] {
  const inside: WaterBody[] = [];

  // Inside the walls the ground is mostly taken by districts and roads, so every
  // candidate that survives the clearance rules is used rather than thinned by a
  // random gate — otherwise a busy project gets no pond at all.
  for (let gridX = bounds.minX; gridX <= bounds.maxX && inside.length < MAX_INSIDE; gridX += INSIDE_STEP) {
    for (let gridZ = bounds.minZ; gridZ <= bounds.maxZ && inside.length < MAX_INSIDE; gridZ += INSIDE_STEP) {
      const seed = hash(gridX, gridZ);
      const x = gridX + ((seed % 100) / 100 - 0.5) * INSIDE_STEP * 0.6;
      const z = gridZ + (((seed >>> 9) % 100) / 100 - 0.5) * INSIDE_STEP * 0.6;
      const radius = scaled(INSIDE_RADIUS, seed);
      if (!insideWall(bounds, x, z, radius + WALL_CLEARANCE)) continue;
      if (!clearOfDistricts(zones, positions, x, z, radius)) continue;
      if (!clearOfPaths(paths, x, z, radius)) continue;
      if (inside.some((body) => Math.hypot(body.center[0] - x, body.center[1] - z) < body.radius + radius + 4)) continue;
      inside.push({ id: `pond-${inside.length}`, center: [x, z], radius, inside: true, seed });
    }
  }

  return inside;
}

/** A compound's footprint in world space, wall included. */
export interface CompoundRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function touchesCompound(rect: CompoundRect, x: number, z: number, radius: number): boolean {
  const clearance = radius + WALL_CLEARANCE;
  return x > rect.minX - clearance && x < rect.maxX + clearance
    && z > rect.minZ - clearance && z < rect.maxZ + clearance;
}

/**
 * Open water in the meadow, laid out once for the whole world.
 *
 * The rule this exists to enforce: no body of water may ever reach a compound.
 * A pond is kept only when its full radius, plus the wall clearance, clears
 * *every* compound in the world — not just the one it happens to be nearest.
 * With several projects side by side the ground between them is shared, so a
 * per-compound pass could not know what it was about to flood.
 *
 * Placement is deterministic from world coordinates, so a compound growing a
 * district never shuffles the lakes around the reader.
 */
export function openWater(compounds: CompoundRect[], reach = OUTSIDE_REACH): WaterBody[] {
  if (compounds.length === 0) return [];
  const area = compounds.reduce((total, rect) => ({
    minX: Math.min(total.minX, rect.minX),
    maxX: Math.max(total.maxX, rect.maxX),
    minZ: Math.min(total.minZ, rect.minZ),
    maxZ: Math.max(total.maxZ, rect.maxZ),
  }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });

  // Every candidate is collected before any is kept. Taking them in scan order
  // spends the whole quota on the first corner of a wide world and leaves the
  // far side dry, which reads as a mistake rather than as a landscape.
  const candidates: WaterBody[] = [];
  for (let gridX = area.minX - reach; gridX <= area.maxX + reach; gridX += SAMPLE_STEP) {
    for (let gridZ = area.minZ - reach; gridZ <= area.maxZ + reach; gridZ += SAMPLE_STEP) {
      const seed = hash(gridX + 0.5, gridZ + 0.5);
      if (seed % 5 !== 0) continue;
      const x = gridX + ((seed % 100) / 100 - 0.5) * SAMPLE_STEP * 0.7;
      const z = gridZ + (((seed >>> 9) % 100) / 100 - 0.5) * SAMPLE_STEP * 0.7;
      const radius = scaled(OUTSIDE_RADIUS, seed);
      if (compounds.some((rect) => touchesCompound(rect, x, z, radius))) continue;
      candidates.push({ id: "", center: [x, z], radius, inside: false, seed });
    }
  }

  // Ordering by the seed rather than by position spreads the kept bodies over
  // the whole meadow, and is as deterministic as the scan it replaces.
  candidates.sort((left, right) => left.seed - right.seed || left.center[0] - right.center[0]);

  // The lake sits a little way out — far enough from a wall not to crowd a
  // project, near enough to still be part of the view. Taking the candidate
  // *furthest* from everything put it out at the edge of the reach, where the
  // fog swallowed it and the world looked as though it had no lake at all.
  const distanceToCompounds = (candidate: WaterBody) => Math.min(...compounds.map((rect) => {
    const dx = Math.max(rect.minX - candidate.center[0], 0, candidate.center[0] - rect.maxX);
    const dz = Math.max(rect.minZ - candidate.center[1], 0, candidate.center[1] - rect.maxZ);
    return Math.hypot(dx, dz);
  }));
  const lakeSite = [...candidates]
    .filter((candidate) => compounds.every((rect) => !touchesCompound(rect, candidate.center[0], candidate.center[1], LAKE_RADIUS)))
    .sort((left, right) =>
      Math.abs(distanceToCompounds(left) - LAKE_STANDOFF)
      - Math.abs(distanceToCompounds(right) - LAKE_STANDOFF)
      || left.seed - right.seed)[0];

  const bodies: WaterBody[] = [];
  if (lakeSite) bodies.push({ ...lakeSite, radius: LAKE_RADIUS, id: "lake" });

  for (const candidate of candidates) {
    if (bodies.length > MAX_PONDS) break;
    const clash = bodies.some((body) => Math.hypot(
      body.center[0] - candidate.center[0],
      body.center[1] - candidate.center[1],
    ) < body.radius + candidate.radius + 6);
    if (clash) continue;
    bodies.push({ ...candidate, id: `water-${bodies.length}` });
  }
  return bodies;
}

/** True when a point is clear of every water body, for scattering props on dry land. */
export function pointClearOfWater(bodies: WaterBody[], x: number, z: number, clearance = 0.6): boolean {
  return bodies.every((body) => Math.hypot(body.center[0] - x, body.center[1] - z) > body.radius + clearance);
}

/**
 * Outline of one body of water as offsets from its centre.
 *
 * The shape is an irregular closed loop rather than a circle, built from a few
 * low-frequency waves so the bank curves like a real shoreline instead of
 * looking like a disc. It is entirely deterministic, and every point stays
 * inside the body's stated radius — that radius is what the placement rules
 * clear against, so an irregular shape can never reach a district or a road that
 * a round one would have missed.
 */
export const WATER_BANK_WIDTH = 0.4;
const SHAPE_BASE = 0.8;
const SHAPE_WAVES: [number, number][] = [[2, 0.12], [3, 0.05], [5, 0.03]];

export function waterOutline(body: WaterBody, segments = 22): Array<[number, number]> {
  const phase = (index: number) => ((body.seed >>> (index * 5)) % 628) / 100;
  return Array.from({ length: segments }, (_, index) => {
    const angle = (index / segments) * Math.PI * 2;
    const factor = SHAPE_WAVES.reduce(
      (total, [frequency, amplitude], waveIndex) => total + Math.sin(angle * frequency + phase(waveIndex)) * amplitude,
      SHAPE_BASE,
    );
    const radius = body.radius * factor;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius] as [number, number];
  });
}

/** The same outline pushed outward, for the wet bank around the water. */
export function waterBankOutline(body: WaterBody, segments = 22): Array<[number, number]> {
  return waterOutline(body, segments).map(([x, z]) => {
    const length = Math.hypot(x, z) || 1;
    const grown = length + WATER_BANK_WIDTH;
    return [x / length * grown, z / length * grown] as [number, number];
  });
}

export interface RiverCourse {
  id: string;
  /** Centre line, from one edge of the world to the other. */
  points: Array<[number, number]>;
  /** Half-width of the channel, constant along its length. */
  halfWidth: number;
  seed: number;
}

/** A river needs at least this much clear ground to run through. */
const RIVER_MIN_LANE = 6;
const RIVER_HALF_WIDTH = 1.15;
/**
 * How far past the outermost compound a river runs.
 *
 * It has to reach the edge of the terrain. At 34 the course simply stopped in
 * open grass with a visible end cap, which is the one thing a river must never
 * do. The caller passes the world's own reach so the two always agree.
 */
const RIVER_OVERSHOOT = 130;

/**
 * The gaps between compounds, along one axis.
 *
 * A river is routed down a lane of open ground rather than being drawn first and
 * checked afterwards. That way it cannot fail the "never touch a compound" rule
 * — the lane is defined by the compounds themselves, and the wobble is clamped
 * inside it.
 */
function openLanes(
  spans: Array<[number, number]>,
  from: number,
  to: number,
  clearance: number,
): Array<[number, number]> {
  const blocked = spans
    .map(([start, end]) => [start - clearance, end + clearance] as [number, number])
    .sort((left, right) => left[0] - right[0]);
  const lanes: Array<[number, number]> = [];
  let cursor = from;
  for (const [start, end] of blocked) {
    if (start > cursor) lanes.push([cursor, start]);
    cursor = Math.max(cursor, end);
  }
  if (cursor < to) lanes.push([cursor, to]);
  return lanes.filter(([start, end]) => end - start >= RIVER_MIN_LANE);
}

/**
 * One or two rivers crossing the world through open ground.
 *
 * Deterministic, and correct by construction: each course runs along the middle
 * of a lane the compounds leave free, and its meander is clamped to stay inside
 * that lane. There is no candidate-and-reject step, so a river can never end up
 * cutting through a project.
 */
export function riverCourses(compounds: CompoundRect[], overshoot = RIVER_OVERSHOOT): RiverCourse[] {
  if (compounds.length === 0) return [];
  const area = compounds.reduce((total, rect) => ({
    minX: Math.min(total.minX, rect.minX),
    maxX: Math.max(total.maxX, rect.maxX),
    minZ: Math.min(total.minZ, rect.minZ),
    maxZ: Math.max(total.maxZ, rect.maxZ),
  }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });

  const margin = RIVER_HALF_WIDTH + 0.9;
  const courses: RiverCourse[] = [];

  // A river running along X sits in a lane of free Z, and the other way round.
  const horizontalLanes = openLanes(
    compounds.map((rect) => [rect.minZ, rect.maxZ] as [number, number]),
    area.minZ - overshoot,
    area.maxZ + overshoot,
    margin,
  );
  const verticalLanes = openLanes(
    compounds.map((rect) => [rect.minX, rect.maxX] as [number, number]),
    area.minX - overshoot,
    area.maxX + overshoot,
    margin,
  );

  /**
   * The widest lane, preferring one that actually runs between the compounds.
   *
   * The open ground beyond the outermost compound is always the widest lane
   * going, so picking on width alone put both rivers out at the edge of the
   * world where nobody would ever see them. A gap between two projects is the
   * interesting place for a river, so those are considered first.
   */
  const widest = (lanes: Array<[number, number]>, low: number, high: number) => {
    const byWidth = [...lanes].sort((left, right) => (right[1] - right[0]) - (left[1] - left[0]));
    const between = byWidth.filter((lane) => {
      const centre = (lane[0] + lane[1]) / 2;
      return centre > low && centre < high;
    });
    return between[0] ?? byWidth[0];
  };

  const addCourse = (
    id: string,
    lane: [number, number] | undefined,
    along: "x" | "z",
  ) => {
    if (!lane) return;
    const centre = (lane[0] + lane[1]) / 2;
    // The meander can never leave the lane, so the channel cannot reach a wall.
    const sway = Math.max(0, (lane[1] - lane[0]) / 2 - margin);
    const seed = Math.round(Math.abs(centre) * 100) % 997;
    const start = along === "x" ? area.minX - overshoot : area.minZ - overshoot;
    const end = along === "x" ? area.maxX + overshoot : area.maxZ + overshoot;
    const steps = 96;
    const points: Array<[number, number]> = Array.from({ length: steps + 1 }, (_, index) => {
      const t = index / steps;
      const distance = start + (end - start) * t;
      const offset = centre
        + Math.sin(t * Math.PI * 2.4 + seed) * sway * 0.62
        + Math.sin(t * Math.PI * 5.1 + seed * 0.7) * sway * 0.22;
      return along === "x" ? [distance, offset] : [offset, distance];
    });
    courses.push({ id, points, halfWidth: RIVER_HALF_WIDTH, seed });
  };

  /**
   * One river, down whichever axis has the better lane.
   *
   * Cutting one along each axis put a crossroads of water through the middle of
   * the world. Rivers do not cross; the shape said "decoration" rather than
   * "landscape", so the wider of the two lanes wins and the other is left dry.
   */
  const horizontal = widest(horizontalLanes, area.minZ, area.maxZ);
  const vertical = widest(verticalLanes, area.minX, area.maxX);
  const horizontalWidth = horizontal ? horizontal[1] - horizontal[0] : 0;
  const verticalWidth = vertical ? vertical[1] - vertical[0] : 0;
  if (horizontalWidth >= verticalWidth) addCourse("river", horizontal, "x");
  else addCourse("river", vertical, "z");
  return courses;
}

/** True when a point is clear of every river channel, for scattering on dry land. */
export function pointClearOfRivers(
  courses: RiverCourse[],
  x: number,
  z: number,
  clearance = 0.6,
): boolean {
  return courses.every((course) => course.points.every(
    ([pointX, pointZ]) => Math.hypot(pointX - x, pointZ - z) > course.halfWidth + clearance,
  ));
}
