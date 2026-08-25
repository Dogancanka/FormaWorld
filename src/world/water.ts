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
const OUTSIDE_RADIUS: [number, number] = [2.6, 5.2];
/** How far past the wall open water may still be placed. */
const OUTSIDE_REACH = 24;
const MAX_INSIDE = 3;
const MAX_OUTSIDE = 6;

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

  const limit = MAX_OUTSIDE * Math.min(compounds.length, 4);
  const bodies: WaterBody[] = [];
  for (const candidate of candidates) {
    if (bodies.length >= limit) break;
    const clash = bodies.some((body) => Math.hypot(
      body.center[0] - candidate.center[0],
      body.center[1] - candidate.center[1],
    ) < body.radius + candidate.radius + 4);
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
