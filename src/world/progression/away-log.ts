import type { WorldEntity } from "../entities/world-entity";
import { entityDueHealth } from "../rules/due-date";
import { ASSET_ZONE, type AssetStatusOption, type ZoneId } from "../zones";
import { diffSnapshots, type WorldSnapshot } from "./snapshot";
import { XP_PER_ACKNOWLEDGEMENT } from "./xp";

/**
 * The "While you were away" digest.
 *
 * APS still exposes no project event stream this app can read, so the world
 * supplies its own: the snapshot the last visit ended on is stored per reader
 * and per project, and this compares it with what is loaded now. A line is
 * therefore a claim about a real transition between two observations — "3 issues
 * closed" means those three were open the last time this reader looked.
 *
 * On a first visit there is nothing to compare against. Rather than invent
 * history, the panel says so and summarises the state being arrived into; those
 * lines are marked `firstVisit` so the UI never dresses them as news.
 *
 * Every line carries the records it is talking about. A headline the reader can
 * only acknowledge is a claim they have to take on trust — carrying the IDs is
 * what lets the panel show those exact records and the world ring them.
 */
export type AwayEventKind = "issue" | "asset" | "rfi" | "form" | "person";

export interface AwayEvent {
  id: string;
  kind: AwayEventKind;
  /** The one-line headline, e.g. "5 assets delivered". */
  headline: string;
  /** The supporting line under it. */
  detail: string;
  xp: number;
  /** The district holding the records this line is about. */
  zone: ZoneId;
  /** The exact records, so the line can show them instead of asserting them. */
  entityIds: string[];
  /**
   * True when this line describes the state being arrived into rather than a
   * change since the last visit, because no previous snapshot existed.
   */
  firstVisit: boolean;
}

export interface AwayLogInput {
  issues: WorldEntity[];
  assets: WorldEntity[];
  assetStatuses: AssetStatusOption[];
  rfis: WorldEntity[];
  forms: WorldEntity[];
  people: WorldEntity[];
  /** The state the last visit by this reader ended on, if there was one. */
  previous?: WorldSnapshot;
  /** The state loaded right now, already built by the caller. */
  current?: WorldSnapshot;
  now?: number;
}

/** How many lines the panel is worth reading before it becomes a wall. */
export const AWAY_EVENT_LIMIT = 5;

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function issueState(entity: WorldEntity): string {
  return typeof entity.metadata.visualState === "string" ? entity.metadata.visualState : "unknown";
}

function statusIdOf(entity: WorldEntity): string | undefined {
  const statusId = entity.metadata.statusId;
  return typeof statusId === "string" && statusId ? statusId : undefined;
}

/**
 * The busiest person in the data, so a headline can name somebody rather than
 * say "someone". Ties break on title so the digest is stable between renders.
 */
function busiestPerson(people: WorldEntity[], issues: WorldEntity[]): WorldEntity | undefined {
  const load = new Map<string, number>();
  for (const issue of issues) {
    const raw = issue.metadata.raw;
    if (!raw || typeof raw !== "object") continue;
    const assignee = (raw as Record<string, unknown>).assignedTo;
    if (typeof assignee !== "string" || !assignee) continue;
    load.set(assignee, (load.get(assignee) ?? 0) + 1);
  }
  const scored = people
    .map((person) => ({ person, score: load.get(person.externalId) ?? 0 }))
    .sort((left, right) => right.score - left.score || left.person.title.localeCompare(right.person.title));
  return scored[0]?.person;
}

function firstName(person: WorldEntity | undefined): string | undefined {
  const name = person?.title.trim().split(/\s+/)[0];
  return name && name.length > 1 ? name : person?.title;
}

interface EventDraft {
  id: string;
  kind: AwayEventKind;
  zone: ZoneId;
  ids: string[];
  headline: string;
  detail: string;
}

/**
 * Lines are ordered by how much they should worry the reader, not by domain:
 * work that has run out of time comes before work that finished, which comes
 * before work that merely appeared. Only the first `AWAY_EVENT_LIMIT` survive,
 * so this ordering decides what a returning reader actually sees.
 */
function draftEvents(drafts: EventDraft[], firstVisit: boolean): AwayEvent[] {
  return drafts
    .filter((draft) => draft.ids.length > 0)
    .slice(0, AWAY_EVENT_LIMIT)
    .map((draft) => ({
      id: `away:${draft.id}`,
      kind: draft.kind,
      zone: draft.zone,
      entityIds: draft.ids,
      headline: draft.headline,
      detail: draft.detail,
      xp: XP_PER_ACKNOWLEDGEMENT,
      firstVisit,
    }));
}

/** "since yesterday", "over the last 4 days" — vague on purpose, because the gap is. */
function elapsedPhrase(elapsedMs: number): string {
  const hours = elapsedMs / 3_600_000;
  if (!Number.isFinite(hours) || hours < 1) return "since you stepped out";
  if (hours < 20) return "since earlier today";
  if (hours < 44) return "since yesterday";
  const days = Math.round(hours / 24);
  if (days < 14) return `over the last ${days} days`;
  return "since your last visit";
}

/**
 * The digest for a reader who has been here before: every line is a transition
 * between the snapshot their last visit ended on and what is loaded now.
 */
function changeEvents(input: AwayLogInput, previous: WorldSnapshot, current: WorldSnapshot): AwayEvent[] {
  const diff = diffSnapshots(previous, current);
  if (diff.quiet) return [];

  const loaded = new Set<string>();
  for (const list of [input.issues, input.assets, input.rfis, input.forms, input.people]) {
    for (const entity of list) loaded.add(entity.id);
  }
  // A diff can name a record the current feeds no longer hold. A line that
  // cannot show its records is a line the reader has to trust, so it is dropped.
  const shown = (ids: string[]) => ids.filter((id) => loaded.has(id));

  const actor = firstName(busiestPerson(input.people, input.issues));
  const statusLabels = new Map(input.assetStatuses.map((status) => [status.id, status.label]));
  const movedTo = new Set(
    diff.assetsMoved.map((change) => statusLabels.get(change.to) ?? "").filter(Boolean),
  );
  const movedDetail = movedTo.size === 1
    ? `They are standing in the ${[...movedTo][0].toLowerCase()} lane now.`
    : "They have each moved a lane along the material yard.";
  const since = elapsedPhrase(current.capturedAt - previous.capturedAt);

  return draftEvents([
    {
      id: "issues-overdue", kind: "issue", zone: "issues", ids: shown(diff.issuesOverdue),
      headline: `${plural(diff.issuesOverdue.length, "issue", "issues")} went overdue`,
      detail: "They are smoking in the yard until somebody answers them.",
    },
    {
      id: "rfis-overdue", kind: "rfi", zone: "rfis", ids: shown(diff.rfisOverdue),
      headline: `${plural(diff.rfisOverdue.length, "RFI", "RFIs")} ran out of time`,
      detail: "Their boards have gone red on the notice wall.",
    },
    {
      id: "issues-closed", kind: "issue", zone: "issues", ids: shown(diff.issuesClosed),
      headline: actor
        ? `${actor} closed ${plural(diff.issuesClosed.length, "issue", "issues")}`
        : `${plural(diff.issuesClosed.length, "issue", "issues")} closed`,
      detail: `The cones in those bays have gone green ${since}.`,
    },
    {
      id: "issues-reopened", kind: "issue", zone: "issues", ids: shown(diff.issuesReopened),
      headline: `${plural(diff.issuesReopened.length, "issue", "issues")} reopened`,
      detail: "They were closed the last time you looked.",
    },
    {
      id: "assets-moved", kind: "asset", zone: ASSET_ZONE,
      ids: shown(diff.assetsMoved.map((change) => change.id)),
      headline: `${plural(diff.assetsMoved.length, "asset", "assets")} changed status`,
      detail: movedDetail,
    },
    {
      id: "issues-new", kind: "issue", zone: "issues", ids: shown(diff.issuesNew),
      headline: `${plural(diff.issuesNew.length, "new issue", "new issues")} raised`,
      detail: "New cones have appeared in the issue yard.",
    },
    {
      id: "rfis-new", kind: "rfi", zone: "rfis", ids: shown(diff.rfisNew),
      headline: `${plural(diff.rfisNew.length, "new RFI", "new RFIs")} raised`,
      detail: "Fresh boards are up on the notice wall.",
    },
    {
      id: "assets-new", kind: "asset", zone: ASSET_ZONE, ids: shown(diff.assetsNew),
      headline: `${plural(diff.assetsNew.length, "asset", "assets")} arrived`,
      detail: "They were unloaded into the material yard.",
    },
    {
      id: "forms-new", kind: "form", zone: "forms", ids: shown(diff.formsNew),
      headline: `${plural(diff.formsNew.length, "new form", "new forms")} on the inspection post`,
      detail: "Walk the checkpoints to see what was signed off.",
    },
    {
      id: "people-joined", kind: "person", zone: "people", ids: shown(diff.peopleJoined),
      headline: `${plural(diff.peopleJoined.length, "member", "members")} joined the crew`,
      detail: "New figures are standing in the camp.",
    },
  ], false);
}

/**
 * The digest for a first visit. There is no history to report, so these lines
 * describe the site being walked into and are flagged as such — the panel
 * renames itself rather than passing them off as news.
 */
function arrivalEvents(input: AwayLogInput, now: number): AwayEvent[] {
  const closed = input.issues.filter((issue) => issueState(issue) === "closed");
  const overdue = input.issues.filter((issue) => issueState(issue) === "overdue");
  const actor = firstName(busiestPerson(input.people, input.issues));
  const finalStatus = input.assetStatuses.at(-1);
  const arrived = finalStatus
    ? input.assets.filter((asset) => statusIdOf(asset) === finalStatus.id)
    : [];
  const dueRfis = input.rfis.filter((rfi) => {
    const health = entityDueHealth(rfi, now);
    return health !== undefined && health.state !== "healthy";
  });

  return draftEvents([
    {
      id: "issues-overdue", kind: "issue", zone: "issues", ids: overdue.map((issue) => issue.id),
      headline: `${plural(overdue.length, "issue is", "issues are")} overdue`,
      detail: "They are smoking in the yard until somebody answers them.",
    },
    {
      id: "issues-closed", kind: "issue", zone: "issues", ids: closed.map((issue) => issue.id),
      headline: actor
        ? `${actor} has ${plural(closed.length, "issue", "issues")} closed`
        : `${plural(closed.length, "issue is", "issues are")} closed`,
      detail: "The cones in those bays are green.",
    },
    {
      id: "rfis-due", kind: "rfi", zone: "rfis", ids: dueRfis.map((rfi) => rfi.id),
      headline: `${plural(dueRfis.length, "RFI needs", "RFIs need")} an answer`,
      detail: "Their boards are running out of time on the notice wall.",
    },
    {
      id: "assets-final", kind: "asset", zone: ASSET_ZONE, ids: arrived.map((asset) => asset.id),
      headline: finalStatus
        ? `${plural(arrived.length, "asset has", "assets have")} reached ${finalStatus.label.toLowerCase()}`
        : `${plural(arrived.length, "asset", "assets")} at dispatch`,
      detail: "They are stacked at the dispatch end of the material yard.",
    },
    {
      id: "forms-open", kind: "form", zone: "forms", ids: input.forms.map((form) => form.id),
      headline: `${plural(input.forms.length, "form", "forms")} on the inspection post`,
      detail: "Walk the checkpoints to see what was signed off.",
    },
    {
      id: "crew-onsite", kind: "person", zone: "people", ids: input.people.map((person) => person.id),
      headline: `${plural(input.people.length, "member is", "members are")} on site`,
      detail: "Click a worker to see their assigned issues.",
    },
  ], true);
}

export function awayEvents(input: AwayLogInput): AwayEvent[] {
  const now = input.now ?? Date.now();
  return input.previous && input.current
    ? changeEvents(input, input.previous, input.current)
    : arrivalEvents(input, now);
}
