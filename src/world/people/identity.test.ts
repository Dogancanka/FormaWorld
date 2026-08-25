import { describe, expect, it } from "vitest";
import { personAppearance, personIdentityKey } from "./identity";
import type { WorldEntity } from "../entities/world-entity";

function person(projectId: string, raw: Record<string, unknown>): WorldEntity {
  return {
    id: `person:${String(raw.id)}`,
    externalId: String(raw.id),
    type: "person",
    title: "Alexandre Moneron",
    source: "aps",
    projectId,
    metadata: { raw },
  };
}

describe("deterministic crew identity", () => {
  it("gives one Autodesk account the same avatar in every project", () => {
    const inProjectA = person("project-a", { id: "member-1", autodeskId: "ABC123", email: "a@example.com" });
    const inProjectB = person("project-b", { id: "member-9999", autodeskId: "ABC123", email: "a@example.com" });
    expect(personAppearance(inProjectA)).toEqual(personAppearance(inProjectB));
  });

  it("prefers the account id over the project membership id", () => {
    expect(personIdentityKey(person("p", { id: "member-1", autodeskId: "ABC123" })).key).toBe("autodesk:abc123");
    expect(personIdentityKey(person("p", { id: "member-1", autodeskId: "ABC123" })).stable).toBe(true);
  });

  it("falls back to email, case-insensitively, when no account id is returned", () => {
    const upper = person("project-a", { id: "member-1", email: "Alexandre.Moneron@Example.com" });
    const lower = person("project-b", { id: "member-2", email: "alexandre.moneron@example.com " });
    expect(personIdentityKey(upper).key).toBe("email:alexandre.moneron@example.com");
    expect(personAppearance(upper)).toEqual(personAppearance(lower));
  });

  it("marks a project-only membership record as an unstable identity", () => {
    const identity = personIdentityKey(person("project-a", { id: "member-1" }));
    expect(identity.key).toBe("member:member-1");
    expect(identity.stable).toBe(false);
  });

  it("does not give every account the same avatar", () => {
    const appearances = new Set(
      Array.from({ length: 40 }, (_, index) => {
        const look = personAppearance(person("p", { id: `m${index}`, autodeskId: `ACCOUNT-${index}` }));
        return `${look.vest}|${look.trousers}|${look.helmet}|${look.skin}|${look.build}`;
      }),
    );
    expect(appearances.size).toBeGreaterThan(20);
  });

  it("always produces a colour from the defined palettes", () => {
    const look = personAppearance(person("p", { id: "m", autodeskId: "zzz" }));
    for (const colour of [look.vest, look.sleeves, look.trousers, look.helmet, look.skin]) {
      expect(colour).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(look.build).toBeGreaterThanOrEqual(0);
    expect(look.build).toBeLessThanOrEqual(2);
  });
});
