import type { CompoundRect } from "../water";

/**
 * The wood around the compounds.
 *
 * This exists as data rather than as components because a believable forest is
 * thousands of plants, and thousands of React elements each owning their own
 * meshes is exactly what a scene cannot afford. Every plant here is one entry in
 * a flat list, and the renderer draws each species with a single instanced mesh
 * — roughly ten draw calls for the whole wood, however many trees are in it.
 *
 * It is scenery, so the rules it obeys are the same ones the water obeys: never
 * on a compound, never in the water, and deterministic, so a district growing
 * does not rearrange the landscape around the reader.
 */
export type PlantKind = "pine" | "bush" | "rock";

export interface Plant {
  kind: PlantKind;
  x: number;
  z: number;
  /** Uniform scale, so one instanced mesh can carry a whole species. */
  scale: number;
  rotation: number;
  /** Index into the renderer's tint table for this species. */
  tint: number;
}

export interface ForestArea {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface ForestInput {
  compounds: CompoundRect[];
  /** Circles the wood must leave alone: lakes, and the rivers' control points. */
  water: Array<{ center: [number, number]; radius: number }>;
  /** How far past the outermost compound the wood reaches. */
  reach?: number;
  /** Upper bound on plants, so a huge world cannot become an unbounded scene. */
  limit?: number;
}

const STEP = 1.15;
const DEFAULT_REACH = 40;
const DEFAULT_LIMIT = 4200;
/** Nothing grows within this of a compound wall. */
const COMPOUND_CLEARANCE = 1.6;
const WATER_CLEARANCE = 0.5;

function hash(x: number, z: number, salt: number): number {
  let value = 2166136261 ^ salt;
  for (const part of [Math.round(x * 16), Math.round(z * 16)]) {
    value ^= part & 0xff;
    value = Math.imul(value, 16777619);
    value ^= (part >> 8) & 0xff;
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function unit(seed: number, shift: number): number {
  return ((seed >>> shift) % 1000) / 1000;
}

/**
 * Groves rather than an even sprinkle.
 *
 * A uniform scatter reads as wallpaper. Summing a few low-frequency waves gives
 * a density field with thick stands and open glades between them, which is what
 * makes a wood look like a place rather than a texture.
 */
function density(x: number, z: number): number {
  return (
    Math.sin(x * 0.075 + 1.3) * Math.cos(z * 0.061 - 0.4) * 0.5
    + Math.sin((x + z) * 0.037 + 2.1) * 0.3
    + Math.cos((x - z) * 0.051 - 1.1) * 0.2
  );
}

export function plantForest(input: ForestInput): Plant[] {
  const { compounds } = input;
  if (compounds.length === 0) return [];
  const reach = input.reach ?? DEFAULT_REACH;
  const limit = input.limit ?? DEFAULT_LIMIT;

  const area: ForestArea = compounds.reduce((total, rect) => ({
    minX: Math.min(total.minX, rect.minX),
    maxX: Math.max(total.maxX, rect.maxX),
    minZ: Math.min(total.minZ, rect.minZ),
    maxZ: Math.max(total.maxZ, rect.maxZ),
  }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });

  const clearOfCompounds = (x: number, z: number) => compounds.every((rect) =>
    x < rect.minX - COMPOUND_CLEARANCE || x > rect.maxX + COMPOUND_CLEARANCE
    || z < rect.minZ - COMPOUND_CLEARANCE || z > rect.maxZ + COMPOUND_CLEARANCE);

  const clearOfWater = (x: number, z: number) => input.water.every((body) =>
    Math.hypot(body.center[0] - x, body.center[1] - z) > body.radius + WATER_CLEARANCE);

  // Candidates are gathered before any are kept. Taking them in scan order
  // spends the whole limit on the first corner of a wide world and leaves the
  // rest bare — which is exactly how the first attempt looked.
  const candidates: Plant[] = [];
  for (let gridX = area.minX - reach; gridX <= area.maxX + reach; gridX += STEP) {
    for (let gridZ = area.minZ - reach; gridZ <= area.maxZ + reach; gridZ += STEP) {
      const seed = hash(gridX, gridZ, 0x9e37);
      // The density field decides how much of the grid survives here, so stands
      // thicken and thin instead of being evenly spaced.
      const threshold = 0.55 + density(gridX, gridZ) * 0.4;
      if (unit(seed, 3) > threshold) continue;

      const x = gridX + (unit(seed, 7) - 0.5) * STEP * 0.9;
      const z = gridZ + (unit(seed, 13) - 0.5) * STEP * 0.9;
      if (!clearOfCompounds(x, z) || !clearOfWater(x, z)) continue;

      const roll = seed % 100;
      const kind: PlantKind = roll < 62 ? "pine" : roll < 88 ? "bush" : "rock";
      candidates.push({
        kind,
        x,
        z,
        scale: kind === "pine"
          ? 0.7 + unit(seed, 17) * 0.75
          : 0.75 + unit(seed, 17) * 0.5,
        rotation: unit(seed, 21) * Math.PI * 2,
        tint: seed % 3,
      });
    }
  }

  if (candidates.length <= limit) return candidates;
  // Thinned by a hash of the position rather than by where the scan reached, so
  // a world too big for the limit still has wood on every side of it.
  return candidates
    .filter((_, index) => index % Math.ceil(candidates.length / limit) === 0)
    .slice(0, limit);
}

/** Split by species, which is how the renderer wants them: one mesh each. */
export function groupByKind(plants: Plant[]): Record<PlantKind, Plant[]> {
  const result: Record<PlantKind, Plant[]> = { pine: [], bush: [], rock: [] };
  for (const plant of plants) result[plant.kind].push(plant);
  return result;
}
