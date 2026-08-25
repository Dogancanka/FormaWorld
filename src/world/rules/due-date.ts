import type { WorldEntity } from "../entities/world-entity";

/**
 * A due date is the closest thing the project data has to a health bar: work
 * that still has time is healthy, work in its last week is running down, and
 * work past its date is spent. The rule lives here rather than in the canvas so
 * the 3D marker, the bar above it and any future panel all read one answer.
 */
export type DueHealthState = "healthy" | "soon" | "overdue";

/** A due date inside this many days shows as running down rather than healthy. */
export const DUE_SOON_DAYS = 7;

/** The bar reads full at this much time left, so a distant date is not a stub. */
export const DUE_FULL_DAYS = 30;

const DAY_MS = 86_400_000;

export interface DueHealth {
  state: DueHealthState;
  /** Whole days remaining; negative once the date has passed. */
  daysLeft: number;
  /** 1 at full health, 0 once the date has passed. */
  ratio: number;
  /** The date the health was measured against, as APS returned it. */
  dueDate: string;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * APS spells the field the same way across Issues v1 and RFIs v2, but the world
 * keeps the untouched record under `metadata.raw`, so both places are read.
 */
export function entityDueDate(entity: WorldEntity): string | undefined {
  const direct = text(entity.metadata.dueDate);
  if (direct) return direct;
  const raw = entity.metadata.raw;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const record = raw as Record<string, unknown>;
  return text(record.dueDate) ?? text(record.due_date) ?? text(record.dueOn);
}

export function dueHealth(dueDate: string | undefined, now: number = Date.now()): DueHealth | undefined {
  if (!dueDate) return undefined;
  const deadline = new Date(dueDate).getTime();
  if (Number.isNaN(deadline)) return undefined;

  const remaining = deadline - now;
  if (remaining <= 0) {
    return { state: "overdue", daysLeft: Math.floor(remaining / DAY_MS), ratio: 0, dueDate };
  }
  const daysLeft = Math.ceil(remaining / DAY_MS);
  const ratio = Math.min(1, remaining / (DUE_FULL_DAYS * DAY_MS));
  return { state: daysLeft <= DUE_SOON_DAYS ? "soon" : "healthy", daysLeft, ratio, dueDate };
}

/** The health of one record, or undefined when it carries no usable due date. */
export function entityDueHealth(entity: WorldEntity, now: number = Date.now()): DueHealth | undefined {
  return dueHealth(entityDueDate(entity), now);
}

export function dueHealthLabel(health: DueHealth): string {
  if (health.state === "overdue") {
    const days = Math.abs(health.daysLeft);
    return days <= 1 ? "Overdue" : `${days} days overdue`;
  }
  return health.daysLeft <= 1 ? "Due today" : `${health.daysLeft} days left`;
}
