import type { WorldEntity } from "../entities";

export type IssueActivityKind = "status-changed" | "assignee-changed" | "issue-updated";

export interface IssueActivityEvent {
  id: string;
  kind: IssueActivityKind;
  issueId: string;
  issueTitle: string;
  actorExternalId?: string;
  workerExternalId?: string;
  detail: string;
  observedAt: number;
}

function raw(entity: WorldEntity): Record<string, unknown> {
  return entity.metadata.raw && typeof entity.metadata.raw === "object"
    ? entity.metadata.raw as Record<string, unknown>
    : {};
}

function value(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate) return candidate;
  }
  return undefined;
}

export function detectIssueActivity(
  previous: WorldEntity[],
  current: WorldEntity[],
  observedAt = Date.now(),
): IssueActivityEvent[] {
  const previousById = new Map(previous.map((entity) => [entity.id, entity]));
  const events: IssueActivityEvent[] = [];
  for (const issue of current) {
    const before = previousById.get(issue.id);
    if (!before) continue;
    const oldRaw = raw(before);
    const newRaw = raw(issue);
    const actorExternalId = value(newRaw, "updatedBy", "lastUpdatedBy");
    const changedAt = value(newRaw, "updatedAt", "lastUpdatedAt") ?? String(observedAt);
    let specificChange = false;
    if (before.status !== issue.status) {
      specificChange = true;
      events.push({
        id: `${issue.id}:${changedAt}:status`, kind: "status-changed", issueId: issue.id,
        issueTitle: issue.title, actorExternalId,
        detail: `${before.status ?? "Unknown"} → ${issue.status ?? "Unknown"}`, observedAt,
      });
    }
    const oldAssignee = value(oldRaw, "assignedTo");
    const newAssignee = value(newRaw, "assignedTo");
    if (oldAssignee !== newAssignee) {
      specificChange = true;
      events.push({
        id: `${issue.id}:${changedAt}:assignee`, kind: "assignee-changed", issueId: issue.id,
        issueTitle: issue.title, actorExternalId, workerExternalId: newAssignee,
        detail: newAssignee ? "Assignee changed" : "Assignee removed", observedAt,
      });
    }
    const oldUpdatedAt = value(oldRaw, "updatedAt", "lastUpdatedAt");
    const newUpdatedAt = value(newRaw, "updatedAt", "lastUpdatedAt");
    if (!specificChange && oldUpdatedAt && newUpdatedAt && oldUpdatedAt !== newUpdatedAt) {
      events.push({
        id: `${issue.id}:${newUpdatedAt}:updated`, kind: "issue-updated", issueId: issue.id,
        issueTitle: issue.title, actorExternalId, detail: "Issue data updated", observedAt,
      });
    }
  }
  return events;
}

export function personMatchesActor(person: WorldEntity, actorExternalId: string | undefined): boolean {
  if (!actorExternalId || person.type !== "person") return false;
  const personRaw = raw(person);
  return actorExternalId === person.externalId
    || actorExternalId === personRaw.id
    || actorExternalId === personRaw.autodeskId;
}
