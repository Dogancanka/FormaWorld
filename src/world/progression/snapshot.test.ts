import { describe, expect, it } from "vitest";
import type { WorldEntity } from "../entities/world-entity";
import { buildSnapshot, diffSnapshots, type WorldSnapshot } from "./snapshot";

const NOW = Date.parse("2026-08-24T12:00:00.000Z");
const DAY = 86_400_000;

function entity(type: WorldEntity["type"], id: string, metadata: Record<string, unknown> = {}): WorldEntity {
  return { id: `${type}:${id}`, externalId: id, type, title: id, source: "aps", projectId: "b.p", metadata };
}

const EMPTY = { issues: [], assets: [], rfis: [], forms: [], people: [], now: NOW };

function snapshot(partial: Partial<WorldSnapshot>): WorldSnapshot {
  return {
    version: 1,
    capturedAt: NOW,
    issues: {},
    assets: {},
    rfis: {},
    forms: {},
    people: [],
    ...partial,
  };
}

describe("buildSnapshot", () => {
  it("records the fields a transition can be read from", () => {
    const built = buildSnapshot({
      ...EMPTY,
      issues: [entity("issue", "i1", { visualState: "open" })],
      assets: [entity("asset", "a1", { statusId: "s2" })],
      rfis: [entity("rfi", "r1", { raw: { dueDate: new Date(NOW - DAY).toISOString() } })],
      forms: [{ ...entity("form", "f1"), status: "open" }],
      people: [entity("person", "u1")],
    });
    expect(built).toMatchObject({
      version: 1,
      capturedAt: NOW,
      issues: { "issue:i1": "open" },
      assets: { "asset:a1": "s2" },
      rfis: { "rfi:r1": "overdue" },
      forms: { "form:f1": "open" },
      people: ["person:u1"],
    });
  });

  it("keeps no project data beyond the state itself", () => {
    const built = buildSnapshot({ ...EMPTY, issues: [entity("issue", "i1", { visualState: "open", raw: { title: "Missing guardrail", assignedTo: "u1" } })] });
    expect(JSON.stringify(built)).not.toContain("guardrail");
    expect(JSON.stringify(built)).not.toContain("assignedTo");
  });
});

describe("diffSnapshots", () => {
  it("reports nothing when the two observations match", () => {
    const state = snapshot({ issues: { "issue:i1": "open" }, people: ["person:u1"] });
    expect(diffSnapshots(state, state).quiet).toBe(true);
  });

  it("separates a close, an overdue and a reopen", () => {
    const before = snapshot({ issues: { "issue:i1": "open", "issue:i2": "open", "issue:i3": "closed" } });
    const after = snapshot({ issues: { "issue:i1": "closed", "issue:i2": "overdue", "issue:i3": "open" } });
    const diff = diffSnapshots(before, after);
    expect(diff.issuesClosed).toEqual(["issue:i1"]);
    expect(diff.issuesOverdue).toEqual(["issue:i2"]);
    expect(diff.issuesReopened).toEqual(["issue:i3"]);
    expect(diff.quiet).toBe(false);
  });

  it("reports an asset that changed status, with both lanes", () => {
    const diff = diffSnapshots(
      snapshot({ assets: { "asset:a1": "s1", "asset:a2": "s1" } }),
      snapshot({ assets: { "asset:a1": "s2", "asset:a2": "s1" } }),
    );
    expect(diff.assetsMoved).toEqual([{ id: "asset:a1", from: "s1", to: "s2" }]);
  });

  it("reports records that appeared, not records that vanished", () => {
    // Every feed is a bounded page, so a record can leave the snapshot because
    // the project grew. Calling that a change would be the world inventing news.
    const diff = diffSnapshots(
      snapshot({ issues: { "issue:i1": "open" }, people: ["person:u1"] }),
      snapshot({ issues: { "issue:i2": "open" }, people: ["person:u2"] }),
    );
    expect(diff.issuesNew).toEqual(["issue:i2"]);
    expect(diff.peopleJoined).toEqual(["person:u2"]);
    expect(diff.issuesClosed).toEqual([]);
  });

  it("does not treat a first sighting as a state change", () => {
    const diff = diffSnapshots(snapshot({}), snapshot({ issues: { "issue:i1": "overdue" } }));
    expect(diff.issuesOverdue).toEqual([]);
    expect(diff.issuesNew).toEqual(["issue:i1"]);
  });
});
