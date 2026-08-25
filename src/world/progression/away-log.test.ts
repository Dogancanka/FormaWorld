import { describe, expect, it } from "vitest";
import type { WorldEntity } from "../entities/world-entity";
import { XP_PER_ACKNOWLEDGEMENT } from "./xp";
import { AWAY_EVENT_LIMIT, awayEvents } from "./away-log";

const NOW = Date.parse("2026-08-24T12:00:00.000Z");
const DAY = 86_400_000;

function entity(type: WorldEntity["type"], id: string, metadata: Record<string, unknown> = {}, title = id): WorldEntity {
  return { id: `${type}:${id}`, externalId: id, type, title, source: "aps", projectId: "b.p", metadata };
}

const EMPTY = { issues: [], assets: [], assetStatuses: [], rfis: [], forms: [], people: [], now: NOW };

describe("awayEvents on a first visit", () => {
  it("says nothing about an empty project", () => {
    expect(awayEvents(EMPTY)).toEqual([]);
  });

  it("names the busiest person in the closed-issue headline", () => {
    const events = awayEvents({
      ...EMPTY,
      people: [entity("person", "u1", {}, "Alexandre Dumas"), entity("person", "u2", {}, "Bo Nielsen")],
      issues: [
        entity("issue", "i1", { visualState: "closed", raw: { assignedTo: "u1" } }),
        entity("issue", "i2", { visualState: "closed", raw: { assignedTo: "u1" } }),
        entity("issue", "i3", { visualState: "open", raw: { assignedTo: "u2" } }),
      ],
    });
    expect(events[0].headline).toBe("Alexandre has 2 issues closed");
    expect(events[0].xp).toBe(XP_PER_ACKNOWLEDGEMENT);
  });

  it("carries the records each line is about, so the line can show them", () => {
    const events = awayEvents({
      ...EMPTY,
      issues: [
        entity("issue", "i1", { visualState: "closed" }),
        entity("issue", "i2", { visualState: "overdue" }),
        entity("issue", "i3", { visualState: "open" }),
      ],
    });
    const closed = events.find((event) => event.id === "away:issues-closed");
    const overdue = events.find((event) => event.id === "away:issues-overdue");
    expect(closed).toMatchObject({ zone: "issues", entityIds: ["issue:i1"] });
    expect(overdue).toMatchObject({ zone: "issues", entityIds: ["issue:i2"] });
    // The open issue is in neither line, so nothing gets highlighted by accident.
    expect(events.flatMap((event) => event.entityIds)).not.toContain("issue:i3");
  });

  it("points every line at the district that holds its records", () => {
    const events = awayEvents({
      ...EMPTY,
      assetStatuses: [{ id: "s1", label: "Installed" }],
      assets: [entity("asset", "a1", { statusId: "s1" })],
      rfis: [entity("rfi", "r1", { raw: { dueDate: new Date(NOW - DAY).toISOString() } })],
      forms: [entity("form", "f1")],
      people: [entity("person", "u1", {}, "Bo")],
    });
    expect(Object.fromEntries(events.map((event) => [event.id, event.zone]))).toEqual({
      "away:assets-final": "assets",
      "away:rfis-due": "rfis",
      "away:forms-open": "forms",
      "away:crew-onsite": "people",
    });
    expect(events.every((event) => event.entityIds.length > 0)).toBe(true);
  });

  it("reports overdue issues separately from closed ones", () => {
    const events = awayEvents({
      ...EMPTY,
      issues: [entity("issue", "i1", { visualState: "overdue" })],
    });
    expect(events.map((event) => event.headline)).toEqual(["1 issue is overdue"]);
  });

  it("counts assets that reached the last lane of the yard", () => {
    const events = awayEvents({
      ...EMPTY,
      assetStatuses: [{ id: "s1", label: "Ordered" }, { id: "s2", label: "Delivered" }],
      assets: [
        entity("asset", "a1", { statusId: "s2" }),
        entity("asset", "a2", { statusId: "s2" }),
        entity("asset", "a3", { statusId: "s1" }),
      ],
    });
    expect(events[0].headline).toBe("2 assets have reached delivered");
  });

  it("only counts RFIs whose due date is running down or past", () => {
    const events = awayEvents({
      ...EMPTY,
      rfis: [
        entity("rfi", "r1", { raw: { dueDate: new Date(NOW + 2 * DAY).toISOString() } }),
        entity("rfi", "r2", { raw: { dueDate: new Date(NOW - DAY).toISOString() } }),
        entity("rfi", "r3", { raw: { dueDate: new Date(NOW + 60 * DAY).toISOString() } }),
        entity("rfi", "r4", {}),
      ],
    });
    expect(events[0].headline).toBe("2 RFIs need an answer");
  });

  it("uses singular wording for a single record", () => {
    const events = awayEvents({ ...EMPTY, people: [entity("person", "u1", {}, "Bo")] });
    expect(events[0].headline).toBe("1 member is on site");
  });

  it("never grows past the panel limit and keeps ids stable", () => {
    const input = {
      ...EMPTY,
      assetStatuses: [{ id: "s1", label: "Installed" }],
      assets: [entity("asset", "a1", { statusId: "s1" })],
      issues: [entity("issue", "i1", { visualState: "closed" }), entity("issue", "i2", { visualState: "overdue" })],
      rfis: [entity("rfi", "r1", { raw: { dueDate: new Date(NOW - DAY).toISOString() } })],
      forms: [entity("form", "f1")],
      people: [entity("person", "u1", {}, "Bo")],
    };
    const events = awayEvents(input);
    expect(events).toHaveLength(AWAY_EVENT_LIMIT);
    expect(events.map((event) => event.id)).toEqual(awayEvents(input).map((event) => event.id));
    expect(new Set(events.map((event) => event.id)).size).toBe(events.length);
  });
});

describe("awayEvents on a return visit", () => {
  const baseline = {
    version: 1 as const,
    capturedAt: NOW - 2 * DAY,
    issues: { "issue:i1": "open", "issue:i2": "open" },
    assets: { "asset:a1": "s1" },
    rfis: {},
    forms: {},
    people: ["person:u1"],
  };

  it("reports the transition rather than the present state", () => {
    const issues = [
      entity("issue", "i1", { visualState: "closed" }),
      entity("issue", "i2", { visualState: "open" }),
    ];
    const events = awayEvents({
      ...EMPTY,
      issues,
      previous: baseline,
      current: {
        ...baseline,
        capturedAt: NOW,
        issues: { "issue:i1": "closed", "issue:i2": "open" },
      },
    });
    // i2 is still open and is therefore not news, even though it is loaded.
    expect(events.map((event) => event.headline)).toEqual(["1 issue closed"]);
    expect(events[0].entityIds).toEqual(["issue:i1"]);
    expect(events[0].firstVisit).toBe(false);
  });

  it("says nothing at all when nothing moved", () => {
    expect(awayEvents({
      ...EMPTY,
      issues: [entity("issue", "i1", { visualState: "open" })],
      previous: baseline,
      current: { ...baseline, capturedAt: NOW },
    })).toEqual([]);
  });

  it("drops a line whose records the current feeds no longer hold", () => {
    // The diff knows issue i1 closed, but it is not in the loaded page any more,
    // so the line could not show its records and is not worth a claim.
    const events = awayEvents({
      ...EMPTY,
      issues: [],
      previous: baseline,
      current: { ...baseline, capturedAt: NOW, issues: { "issue:i1": "closed", "issue:i2": "open" } },
    });
    expect(events).toEqual([]);
  });

  it("names the lane an asset moved into", () => {
    const events = awayEvents({
      ...EMPTY,
      assets: [entity("asset", "a1", { statusId: "s2" })],
      assetStatuses: [{ id: "s1", label: "Ordered" }, { id: "s2", label: "Delivered" }],
      previous: baseline,
      current: { ...baseline, capturedAt: NOW, assets: { "asset:a1": "s2" } },
    });
    expect(events[0].headline).toBe("1 asset changed status");
    expect(events[0].detail).toBe("They are standing in the delivered lane now.");
  });

  it("puts work that ran out of time above work that finished", () => {
    const events = awayEvents({
      ...EMPTY,
      issues: [
        entity("issue", "i1", { visualState: "closed" }),
        entity("issue", "i2", { visualState: "overdue" }),
      ],
      previous: baseline,
      current: { ...baseline, capturedAt: NOW, issues: { "issue:i1": "closed", "issue:i2": "overdue" } },
    });
    expect(events.map((event) => event.id)).toEqual(["away:issues-overdue", "away:issues-closed"]);
  });
});
