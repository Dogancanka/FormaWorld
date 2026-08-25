import type { AssetStatusOption } from "../zones";

/**
 * Ground footprint of one material stack, and therefore of its click target.
 * Lane spacing must stay above it: overlapping click boxes are what made a stack
 * swallow the hover of the stack behind it.
 */
export const ASSET_STACK_FOOTPRINT = 0.62;

/** Floor space at each end of the yard for the intake and dispatch equipment. */
export const YARD_END_WIDTH = 4.6;
const LANE_WIDTH_MAX = 4.6;
const LANE_WIDTH_MIN = 2.6;
const YARD_WIDTH_MAX = 34;
export const YARD_DEPTH = 9.4;
/** Depth kept clear at the back of a lane for its status marker. */
const LANE_BACK_MARGIN = 1.3;
const LANE_FRONT_MARGIN = 0.8;

export interface AssetLane {
  statusId?: string;
  label: string;
  /** Lane centre on the yard's x axis, relative to the district centre. */
  x: number;
  width: number;
}

export interface AssetPlacement<T> {
  asset: T;
  /** Offset from the district centre. */
  offset: [number, number];
}

export interface AssetYardPlan<T> {
  size: [number, number];
  intakeX: number;
  dispatchX: number;
  lanes: AssetLane[];
  placements: Array<AssetPlacement<T>>;
}

function laneWidth(count: number): number {
  if (count <= 0) return LANE_WIDTH_MAX;
  const available = YARD_WIDTH_MAX - YARD_END_WIDTH * 2;
  return Math.max(LANE_WIDTH_MIN, Math.min(LANE_WIDTH_MAX, available / count));
}

/**
 * The whole asset workflow as one yard, read left to right.
 *
 * Material arrives at the intake end, sits in the lane for whichever status it
 * currently holds, and leaves from the dispatch end. Lane order is the project's
 * own APS status order, so a status change moves an asset one step along the
 * same yard instead of to a different district.
 */
export function layoutAssetYard<T>(
  statuses: AssetStatusOption[],
  assets: T[],
  statusIdOf: (asset: T) => string | undefined,
  groupKeyOf: (asset: T) => string,
): AssetYardPlan<T> {
  const known = statuses.map((status) => ({ statusId: status.id as string | undefined, label: status.label }));
  const unresolved = assets.some((asset) => {
    const statusId = statusIdOf(asset);
    return !statusId || !statuses.some((status) => status.id === statusId);
  });
  const laneSpecs = unresolved
    ? [...known, { statusId: undefined, label: "Unknown status" }]
    : known;
  const specs = laneSpecs.length > 0 ? laneSpecs : [{ statusId: undefined, label: "No status set" }];

  const width = laneWidth(specs.length);
  const laneSpan = width * specs.length;
  const size: [number, number] = [laneSpan + YARD_END_WIDTH * 2, YARD_DEPTH];
  const laneStart = -laneSpan / 2;

  const lanes: AssetLane[] = specs.map((spec, index) => ({
    ...spec,
    x: laneStart + width * (index + 0.5),
    width,
  }));

  const byLane = new Map<string, T[]>();
  for (const asset of assets) {
    const statusId = statusIdOf(asset);
    const lane = lanes.find((candidate) => candidate.statusId === statusId) ?? lanes[lanes.length - 1];
    const key = lane.statusId ?? "";
    byLane.set(key, [...(byLane.get(key) ?? []), asset]);
  }

  const placements: Array<AssetPlacement<T>> = [];
  for (const lane of lanes) {
    const laneAssets = (byLane.get(lane.statusId ?? "") ?? [])
      .slice()
      .sort((left, right) => groupKeyOf(left).localeCompare(groupKeyOf(right)));
    if (laneAssets.length === 0) continue;

    const usableWidth = Math.max(ASSET_STACK_FOOTPRINT, lane.width - 0.7);
    const backBoundary = -YARD_DEPTH / 2 + LANE_BACK_MARGIN;
    const frontBoundary = YARD_DEPTH / 2 - LANE_FRONT_MARGIN;
    const laneDepth = frontBoundary - backBoundary;

    const spacings = [1.15, 1.05, 0.95, 0.86, 0.78, 0.72, 0.66];
    let spacing = spacings[spacings.length - 1];
    let columns = 1;
    for (const candidate of spacings) {
      const candidateColumns = Math.max(1, Math.floor(usableWidth / candidate));
      const rows = Math.ceil(laneAssets.length / candidateColumns);
      spacing = candidate;
      columns = candidateColumns;
      if (rows * candidate <= laneDepth) break;
    }

    const rows = Math.ceil(laneAssets.length / columns);
    const rowSpacing = rows > 1 ? Math.min(spacing, laneDepth / rows) : 0;
    const occupied = (rows - 1) * rowSpacing;
    const startZ = (backBoundary + frontBoundary - occupied) / 2;

    laneAssets.forEach((asset, index) => {
      const row = Math.floor(index / columns);
      const column = index % columns;
      const columnsInRow = Math.min(columns, laneAssets.length - row * columns);
      placements.push({
        asset,
        offset: [lane.x + (column - (columnsInRow - 1) / 2) * spacing, startZ + row * rowSpacing],
      });
    });
  }

  return {
    size,
    intakeX: laneStart - YARD_END_WIDTH / 2,
    dispatchX: -laneStart + YARD_END_WIDTH / 2,
    lanes,
    placements,
  };
}
