import { describe, expect, it } from "vitest";
import type { WorldEntity } from "../entities";
import { detectIssueActivity, personMatchesActor } from "./issue-activity";

function issue(status: string, assignedTo: string, updatedAt: string): WorldEntity {
  return { id: "issue:i1", externalId: "i1", type: "issue", title: "Guardrail", status, source: "aps", projectId: "p", metadata: { raw: { assignedTo, updatedAt, updatedBy: "actor-1" } } };
}

describe("issue activity detection", () => {
  it("emits only changes proven between APS snapshots", () => {
    const events = detectIssueActivity([issue("open", "p1", "t1")], [issue("closed", "p2", "t2")], 123);
    expect(events.map((event) => event.kind)).toEqual(["status-changed", "assignee-changed"]);
    expect(events[0]).toMatchObject({ actorExternalId: "actor-1", observedAt: 123 });
    expect(events[1]).toMatchObject({ actorExternalId: "actor-1", workerExternalId: "p2" });
  });

  it("does not report activity on the initial snapshot or unchanged data", () => {
    expect(detectIssueActivity([], [issue("open", "p1", "t1")])).toEqual([]);
    expect(detectIssueActivity([issue("open", "p1", "t1")], [issue("open", "p1", "t1")])).toEqual([]);
  });

  it("matches actors only by explicit APS identifiers", () => {
    const person: WorldEntity = { id: "person:p1", externalId: "p1", type: "person", title: "Alex", source: "aps", projectId: "p", metadata: { raw: { autodeskId: "actor-1" } } };
    expect(personMatchesActor(person, "actor-1")).toBe(true);
    expect(personMatchesActor({ ...person, title: "actor-1" }, "unrelated")).toBe(false);
  });
});
