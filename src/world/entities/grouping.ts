import { ISSUE_BAY_LABELS, ISSUE_BAY_ORDER } from "../issues/layout";
import type { IssueVisualState } from "../rules/issue-state";
import type { AssetStatusOption, ZoneKind } from "../zones";
import type { WorldEntity } from "./world-entity";

/**
 * The district panel lists the same records the world shows, so it groups them
 * the same way the world does: assets by the project's own APS status order —
 * the order of the lanes in the yard — and issues by bay order. A flat list
 * broke the link between what the panel says and what the ground looks like.
 */
export interface EntityGroup {
  key: string;
  label: string;
  entities: WorldEntity[];
}

const UNGROUPED = "__all__";

function statusIdOf(entity: WorldEntity): string | undefined {
  const statusId = entity.metadata.statusId;
  return typeof statusId === "string" && statusId ? statusId : undefined;
}

function visualStateOf(entity: WorldEntity): IssueVisualState {
  const state = entity.metadata.visualState;
  return typeof state === "string" && ISSUE_BAY_ORDER.includes(state as IssueVisualState)
    ? state as IssueVisualState
    : "unknown";
}

function statusLabelOf(entity: WorldEntity): string {
  const status = entity.status?.trim();
  return status && status.length > 0 ? status : "No status";
}

function collect(
  entities: WorldEntity[],
  keyOf: (entity: WorldEntity) => string,
  labelOf: (key: string, entity: WorldEntity) => string,
  order: string[],
): EntityGroup[] {
  const grouped = new Map<string, WorldEntity[]>();
  const labels = new Map<string, string>();
  for (const entity of entities) {
    const key = keyOf(entity);
    grouped.set(key, [...(grouped.get(key) ?? []), entity]);
    if (!labels.has(key)) labels.set(key, labelOf(key, entity));
  }
  const rank = new Map(order.map((key, index) => [key, index]));
  return [...grouped.entries()]
    .sort(([left], [right]) => {
      const leftRank = rank.get(left) ?? Number.MAX_SAFE_INTEGER;
      const rightRank = rank.get(right) ?? Number.MAX_SAFE_INTEGER;
      if (leftRank !== rightRank) return leftRank - rightRank;
      return (labels.get(left) ?? left).localeCompare(labels.get(right) ?? right);
    })
    .map(([key, grouped_]) => ({ key, label: labels.get(key) ?? key, entities: grouped_ }));
}

export function groupDistrictEntities(
  entities: WorldEntity[],
  kind: ZoneKind | undefined,
  assetStatuses: AssetStatusOption[] = [],
): EntityGroup[] {
  if (entities.length === 0) return [];

  if (kind === "assets") {
    const labels = new Map(assetStatuses.map((status) => [status.id, status.label]));
    return collect(
      entities,
      (entity) => statusIdOf(entity) ?? "unresolved",
      (key, entity) => labels.get(key) ?? statusLabelOf(entity),
      [...assetStatuses.map((status) => status.id), "unresolved"],
    );
  }

  if (kind === "issues") {
    return collect(
      entities,
      (entity) => visualStateOf(entity),
      (key) => ISSUE_BAY_LABELS[key as IssueVisualState] ?? key,
      ISSUE_BAY_ORDER,
    );
  }

  if (kind === "rfis" || kind === "forms") {
    return collect(entities, statusLabelOf, (key) => key, []);
  }

  // People and documents have no status worth splitting a short list over.
  return [{ key: UNGROUPED, label: "", entities }];
}

export function isUngrouped(groups: EntityGroup[]): boolean {
  return groups.length === 1 && groups[0].key === UNGROUPED;
}
