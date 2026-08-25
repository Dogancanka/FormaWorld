import type { WorldEntity } from "./entities/world-entity";
import type { AssetStatusOption } from "./zones";

/**
 * A world can hold several projects, each as its own walled compound.
 *
 * Two things have to be true at once. The HUD, the inspector, the away digest
 * and the statistics all talk about "the world" and should keep working over
 * whatever it contains, so the feeds are merged into the same shapes those
 * parts already read. But layout is per project: districts come from a
 * project's own APS asset statuses, and each compound has its own wall, so the
 * per-project feeds are kept alongside the merged ones rather than thrown away.
 */
export interface WorldProjectRef {
  id: string;
  name: string;
  hubName?: string;
}

/** The shape every domain feed shares, which is what makes merging possible. */
interface EntityFeedLike {
  state: "available" | "empty" | "permission_denied" | "unsupported" | "error";
  entities: WorldEntity[];
  total: number;
  limit: number;
  stale?: boolean;
  error?: string;
  httpStatus?: number;
}

/**
 * One "available" project makes the world available.
 *
 * The alternative — worst-of — would report a whole multi-project world as
 * broken because one of five compounds is missing a module the others have.
 * The per-project alerts still name which project failed, so nothing is hidden
 * by this being the optimistic answer.
 */
function mergeState<T extends EntityFeedLike>(feeds: T[]): T["state"] {
  if (feeds.some((feed) => feed.state === "available")) return "available";
  if (feeds.some((feed) => feed.state === "empty")) return "empty";
  return feeds[0]?.state ?? "empty";
}

export function mergeEntityFeeds<T extends EntityFeedLike>(
  feeds: Array<T | undefined>,
  empty: T,
): T | undefined {
  const present = feeds.filter((feed): feed is T => Boolean(feed));
  if (present.length === 0) return undefined;
  if (present.length === 1) return present[0];
  const failed = present.find((feed) => feed.error);
  return {
    ...empty,
    state: mergeState(present),
    entities: present.flatMap((feed) => feed.entities),
    total: present.reduce((sum, feed) => sum + feed.total, 0),
    limit: present.reduce((sum, feed) => sum + feed.limit, 0),
    stale: present.some((feed) => feed.stale) || undefined,
    error: failed?.error,
    httpStatus: failed?.httpStatus,
  };
}

/**
 * Asset statuses drive the lanes of a material yard, and two projects rarely
 * order theirs the same way. The merged list exists only for parts that need a
 * single vocabulary — the action composer, the statistics — and keeps the first
 * occurrence of each ID so its order stays stable between reconciliations.
 */
export function mergeStatusOptions(lists: AssetStatusOption[][]): AssetStatusOption[] {
  const seen = new Map<string, AssetStatusOption>();
  for (const list of lists) {
    for (const option of list) if (!seen.has(option.id)) seen.set(option.id, option);
  }
  return [...seen.values()];
}

export interface CompoundFootprint {
  /** Half the width and half the depth the compound occupies, plus its wall. */
  halfWidth: number;
  halfDepth: number;
}

export interface CompoundPlacement {
  projectId: string;
  /** Where this compound's own origin sits in world space. */
  offset: [number, number];
}

/**
 * Open ground between two neighbouring compounds.
 *
 * Nine units was enough to keep them apart and nothing else. Widening it gives
 * the landscape somewhere to be: a river needs roughly six units of clear lane
 * after its banks, and a wood between two projects reads far better than a
 * corridor of bare grass.
 */
export const COMPOUND_GAP = 15;

/**
 * Lay the compounds out on a row-major grid, widest-first per row.
 *
 * The grid is squarish rather than a single line: a row of six compounds forces
 * the overview camera so far back that each one becomes an unreadable smudge,
 * whereas a 3x2 keeps them all legible in one frame. Placement is deterministic
 * for a given order and set of footprints, so a reconciliation that changes a
 * district's size never shuffles the projects around the reader.
 */
export function placeCompounds(
  footprints: Array<CompoundFootprint & { projectId: string }>,
): CompoundPlacement[] {
  if (footprints.length === 0) return [];
  if (footprints.length === 1) {
    return [{ projectId: footprints[0].projectId, offset: [0, 0] }];
  }

  const columns = Math.ceil(Math.sqrt(footprints.length));
  const rows: Array<typeof footprints> = [];
  for (let index = 0; index < footprints.length; index += columns) {
    rows.push(footprints.slice(index, index + columns));
  }

  // Each row is as tall as its tallest compound, and each column as wide as its
  // widest, so compounds of different sizes never overlap.
  const rowDepths = rows.map((row) => Math.max(...row.map((entry) => entry.halfDepth)) * 2);
  const columnWidths: number[] = [];
  for (let column = 0; column < columns; column += 1) {
    const widths = rows.map((row) => row[column]?.halfWidth ?? 0);
    columnWidths[column] = Math.max(...widths) * 2;
  }

  const totalWidth = columnWidths.reduce((sum, width) => sum + width, 0)
    + COMPOUND_GAP * (columns - 1);
  const totalDepth = rowDepths.reduce((sum, depth) => sum + depth, 0)
    + COMPOUND_GAP * (rows.length - 1);

  const placements: CompoundPlacement[] = [];
  let z = -totalDepth / 2;
  rows.forEach((row, rowIndex) => {
    let x = -totalWidth / 2;
    row.forEach((entry, columnIndex) => {
      placements.push({
        projectId: entry.projectId,
        offset: [x + columnWidths[columnIndex] / 2, z + rowDepths[rowIndex] / 2],
      });
      x += columnWidths[columnIndex] + COMPOUND_GAP;
    });
    z += rowDepths[rowIndex] + COMPOUND_GAP;
  });
  return placements;
}
