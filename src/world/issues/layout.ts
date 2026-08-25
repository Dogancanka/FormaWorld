import type { WorldEntity } from "../entities";
import type { IssueVisualState } from "../rules/issue-state";

// The issues district is a marked-out works area: one painted bay per APS state,
// with one traffic cone per issue standing inside it. Both the bay marking and
// the cone grid are sized from the records actually loaded, so a bay is never
// overfilled and a cone never stands outside its box.

/** The fixed floor area each bay may occupy. Bays never grow past it. */
export const ISSUE_BAY_SLOT: [number, number] = [4.2, 3.4];

/** Fixed bay centres inside the district: three across the back, two in front. */
export const ISSUE_BAY_CENTERS: Record<IssueVisualState, [number, number]> = {
  open: [-4.55, -2.1],
  overdue: [0, -2.1],
  answered: [4.55, -2.1],
  closed: [-4.55, 2.1],
  unknown: [0, 2.1],
};

export const ISSUE_BAY_LABELS: Record<IssueVisualState, string> = {
  open: "Open",
  overdue: "Overdue",
  answered: "Answered",
  closed: "Closed",
  unknown: "Other status",
};

export const ISSUE_BAY_ORDER: IssueVisualState[] = ["open", "overdue", "answered", "closed", "unknown"];

const PREFERRED_SPACING = 0.68;
const MIN_SPACING = 0.34;
const SPACING_STEP = 0.02;
/** Ground footprint of a cone at scale 1. */
export const CONE_FOOTPRINT = 0.34;
/** Below this spacing the cones are scaled down so they keep a visible gap. */
const COMFORTABLE_SPACING = 0.46;
const BAY_PADDING = 0.42;
const MIN_BAY: [number, number] = [1.7, 1.5];

export interface IssueBay {
  state: IssueVisualState;
  label: string;
  /** Bay centre, relative to the district centre. */
  center: [number, number];
  /** Painted rectangle, sized to the records it holds. */
  size: [number, number];
  spacing: number;
  coneScale: number;
  markers: Array<{ id: string; offset: [number, number] }>;
}

function visualState(entity: WorldEntity): IssueVisualState {
  const state = entity.metadata.visualState;
  return typeof state === "string" && state in ISSUE_BAY_CENTERS
    ? state as IssueVisualState
    : "unknown";
}

/** Largest spacing at or below the preferred one that fits `count` in the slot. */
function fittingGrid(count: number, slot: [number, number]): { columns: number; rows: number; spacing: number } {
  for (let spacing = PREFERRED_SPACING; spacing >= MIN_SPACING; spacing -= SPACING_STEP) {
    const columns = Math.max(1, Math.floor(slot[0] / spacing));
    const rows = Math.ceil(count / columns);
    if (rows * spacing <= slot[1]) return { columns, rows, spacing };
  }
  // More records than the bay can hold at the minimum spacing: pack to the slot
  // and let the caller's display limit do the rest. Nothing leaves the box.
  const columns = Math.max(1, Math.floor(slot[0] / MIN_SPACING));
  return { columns, rows: Math.ceil(count / columns), spacing: MIN_SPACING };
}

export function layoutIssueBays(
  entities: WorldEntity[],
  slot: [number, number] = ISSUE_BAY_SLOT,
): IssueBay[] {
  const grouped = new Map<IssueVisualState, WorldEntity[]>();
  for (const entity of entities) {
    const state = visualState(entity);
    grouped.set(state, [...(grouped.get(state) ?? []), entity]);
  }

  return ISSUE_BAY_ORDER.map((state) => {
    const members = grouped.get(state) ?? [];
    const { columns, rows, spacing } = fittingGrid(Math.max(members.length, 1), slot);
    const coneScale = Math.min(1, spacing / COMFORTABLE_SPACING);
    const usedColumns = Math.min(columns, Math.max(members.length, 1));
    const gridWidth = usedColumns * spacing;
    const gridDepth = rows * spacing;
    const size: [number, number] = [
      Math.min(slot[0], Math.max(MIN_BAY[0], gridWidth + BAY_PADDING)),
      Math.min(slot[1], Math.max(MIN_BAY[1], gridDepth + BAY_PADDING)),
    ];
    const markers = members.map((entity, index) => {
      const row = Math.floor(index / columns);
      const column = index % columns;
      const columnsInRow = Math.min(columns, members.length - row * columns);
      return {
        id: entity.id,
        offset: [
          (column - (columnsInRow - 1) / 2) * spacing,
          (row - (rows - 1) / 2) * spacing,
        ] as [number, number],
      };
    });
    return { state, label: ISSUE_BAY_LABELS[state], center: ISSUE_BAY_CENTERS[state], size, spacing, coneScale, markers };
  });
}

/** Marker offsets relative to the district centre, keyed by entity id. */
export function issueMarkerOffsets(bays: IssueBay[]): Map<string, [number, number]> {
  const offsets = new Map<string, [number, number]>();
  for (const bay of bays) {
    for (const marker of bay.markers) {
      offsets.set(marker.id, [bay.center[0] + marker.offset[0], bay.center[1] + marker.offset[1]]);
    }
  }
  return offsets;
}
