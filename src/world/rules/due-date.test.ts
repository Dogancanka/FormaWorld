import { describe, expect, it } from "vitest";
import type { WorldEntity } from "../entities/world-entity";
import { dueHealth, dueHealthLabel, entityDueDate, entityDueHealth } from "./due-date";

const NOW = Date.parse("2026-08-24T12:00:00.000Z");
const DAY = 86_400_000;

function issue(metadata: Record<string, unknown>): WorldEntity {
  return {
    id: "issue:1", externalId: "1", type: "issue", title: "Leaking valve",
    source: "aps", projectId: "b.p", metadata,
  };
}

describe("dueHealth", () => {
  it("reports nothing without a usable date", () => {
    expect(dueHealth(undefined, NOW)).toBeUndefined();
    expect(dueHealth("", NOW)).toBeUndefined();
    expect(dueHealth("not a date", NOW)).toBeUndefined();
  });

  it("is healthy well before the date and full at thirty days", () => {
    const health = dueHealth(new Date(NOW + 30 * DAY).toISOString(), NOW);
    expect(health).toMatchObject({ state: "healthy", daysLeft: 30, ratio: 1 });
    expect(dueHealth(new Date(NOW + 90 * DAY).toISOString(), NOW)?.ratio).toBe(1);
  });

  it("runs down inside the last week", () => {
    expect(dueHealth(new Date(NOW + 8 * DAY).toISOString(), NOW)?.state).toBe("healthy");
    expect(dueHealth(new Date(NOW + 7 * DAY).toISOString(), NOW)?.state).toBe("soon");
    expect(dueHealth(new Date(NOW + 2 * DAY).toISOString(), NOW)?.state).toBe("soon");
  });

  it("is spent once the date has passed", () => {
    const health = dueHealth(new Date(NOW - 3 * DAY).toISOString(), NOW);
    expect(health).toMatchObject({ state: "overdue", ratio: 0, daysLeft: -3 });
  });

  it("counts a part-day overrun as a full day overdue", () => {
    expect(dueHealth(new Date(NOW - DAY / 2).toISOString(), NOW)?.daysLeft).toBe(-1);
  });
});

describe("entityDueDate", () => {
  it("prefers the promoted field", () => {
    expect(entityDueDate(issue({ dueDate: "2026-09-01" }))).toBe("2026-09-01");
  });

  it("falls back to the untouched APS record", () => {
    expect(entityDueDate(issue({ raw: { dueDate: "2026-09-02" } }))).toBe("2026-09-02");
    expect(entityDueDate(issue({ raw: { due_date: "2026-09-03" } }))).toBe("2026-09-03");
  });

  it("reports nothing when the record carries no date", () => {
    expect(entityDueDate(issue({ raw: { title: "x" } }))).toBeUndefined();
    expect(entityDueHealth(issue({}), NOW)).toBeUndefined();
  });
});

describe("dueHealthLabel", () => {
  it("reads as time remaining or time lost", () => {
    expect(dueHealthLabel(dueHealth(new Date(NOW + 5 * DAY).toISOString(), NOW)!)).toBe("5 days left");
    expect(dueHealthLabel(dueHealth(new Date(NOW + DAY / 4).toISOString(), NOW)!)).toBe("Due today");
    expect(dueHealthLabel(dueHealth(new Date(NOW - 4 * DAY).toISOString(), NOW)!)).toBe("4 days overdue");
    expect(dueHealthLabel(dueHealth(new Date(NOW - DAY / 2).toISOString(), NOW)!)).toBe("Overdue");
  });
});
