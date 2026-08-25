import type { WorldEntity } from "../entities/world-entity";
import { entityDueHealth } from "../rules/due-date";

/**
 * The state a visit ended on, small enough to store and complete enough to diff.
 *
 * The digest used to be a summary of the state the world was found in, phrased
 * as arrival news, because APS exposes no event stream this app can read. It
 * still cannot read one — but it can remember. A snapshot is taken when a visit
 * ends and compared on the next arrival, so "3 issues closed" is now a claim
 * about a real transition between two observations rather than a restatement of
 * the present.
 *
 * Only the fields a transition can be read from are kept. Titles, assignees and
 * dates stay in APS, which is still the only authority on what a record *is*.
 */
export interface WorldSnapshot {
  /** Schema version, so a later shape change can retire old files safely. */
  version: 1;
  capturedAt: number;
  /** Entity id → issue presentation state (open, answered, closed, overdue). */
  issues: Record<string, string>;
  /** Entity id → APS status id, which is what moves an asset along the yard. */
  assets: Record<string, string>;
  /** Entity id → due health state, the only RFI transition the world can see. */
  rfis: Record<string, string>;
  /** Entity id → APS status text. */
  forms: Record<string, string>;
  /** Entity ids of loaded project members. */
  people: string[];
}

export interface SnapshotInput {
  issues: WorldEntity[];
  assets: WorldEntity[];
  rfis: WorldEntity[];
  forms: WorldEntity[];
  people: WorldEntity[];
  now?: number;
}

function issueState(entity: WorldEntity): string {
  return typeof entity.metadata.visualState === "string" ? entity.metadata.visualState : "unknown";
}

function statusId(entity: WorldEntity): string {
  const value = entity.metadata.statusId;
  return typeof value === "string" && value ? value : "";
}

function dueState(entity: WorldEntity, now: number): string {
  return entityDueHealth(entity, now)?.state ?? "undated";
}

function index(entities: WorldEntity[], read: (entity: WorldEntity) => string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entity of entities) result[entity.id] = read(entity);
  return result;
}

export function buildSnapshot(input: SnapshotInput): WorldSnapshot {
  const now = input.now ?? Date.now();
  return {
    version: 1,
    capturedAt: now,
    issues: index(input.issues, issueState),
    assets: index(input.assets, statusId),
    rfis: index(input.rfis, (rfi) => dueState(rfi, now)),
    forms: index(input.forms, (form) => form.status ?? ""),
    people: input.people.map((person) => person.id),
  };
}

export interface StateChange {
  id: string;
  from: string;
  to: string;
}

export interface SnapshotDiff {
  /** Issues whose presentation state changed, grouped by what they became. */
  issuesClosed: string[];
  issuesOverdue: string[];
  issuesReopened: string[];
  issuesNew: string[];
  /** Assets that moved to a different APS status, so a different yard lane. */
  assetsMoved: StateChange[];
  assetsNew: string[];
  rfisOverdue: string[];
  rfisNew: string[];
  formsNew: string[];
  peopleJoined: string[];
  /** True when nothing at all changed between the two observations. */
  quiet: boolean;
}

function appeared(previous: Record<string, string>, current: Record<string, string>): string[] {
  return Object.keys(current).filter((id) => !(id in previous));
}

/**
 * A record missing from the current snapshot is *not* reported as a change.
 * Every feed is a bounded page — 50 issues, 300 assets — so a record can fall
 * out of view because the project grew, not because anything happened to it.
 * Claiming "4 issues disappeared" from that would be the world lying.
 */
export function diffSnapshots(previous: WorldSnapshot, current: WorldSnapshot): SnapshotDiff {
  const issuesClosed: string[] = [];
  const issuesOverdue: string[] = [];
  const issuesReopened: string[] = [];
  for (const [id, state] of Object.entries(current.issues)) {
    const before = previous.issues[id];
    if (before === undefined || before === state) continue;
    if (state === "closed") issuesClosed.push(id);
    else if (state === "overdue") issuesOverdue.push(id);
    else if (before === "closed") issuesReopened.push(id);
  }

  const assetsMoved: StateChange[] = [];
  for (const [id, status] of Object.entries(current.assets)) {
    const before = previous.assets[id];
    if (before === undefined || before === status || !status) continue;
    assetsMoved.push({ id, from: before, to: status });
  }

  const rfisOverdue: string[] = [];
  for (const [id, state] of Object.entries(current.rfis)) {
    const before = previous.rfis[id];
    if (before === undefined || before === state) continue;
    if (state === "overdue") rfisOverdue.push(id);
  }

  const previousPeople = new Set(previous.people);

  const result: SnapshotDiff = {
    issuesClosed,
    issuesOverdue,
    issuesReopened,
    issuesNew: appeared(previous.issues, current.issues),
    assetsMoved,
    assetsNew: appeared(previous.assets, current.assets),
    rfisOverdue,
    rfisNew: appeared(previous.rfis, current.rfis),
    formsNew: appeared(previous.forms, current.forms),
    peopleJoined: current.people.filter((id) => !previousPeople.has(id)),
    quiet: false,
  };
  result.quiet =
    result.issuesClosed.length === 0 &&
    result.issuesOverdue.length === 0 &&
    result.issuesReopened.length === 0 &&
    result.issuesNew.length === 0 &&
    result.assetsMoved.length === 0 &&
    result.assetsNew.length === 0 &&
    result.rfisOverdue.length === 0 &&
    result.rfisNew.length === 0 &&
    result.formsNew.length === 0 &&
    result.peopleJoined.length === 0;
  return result;
}
