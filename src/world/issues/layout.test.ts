import { describe, expect, it } from "vitest";
import type { WorldEntity } from "../entities";
import type { IssueVisualState } from "../rules/issue-state";
import {
  CONE_FOOTPRINT,
  ISSUE_BAY_CENTERS,
  ISSUE_BAY_SLOT,
  issueMarkerOffsets,
  layoutIssueBays,
} from "./layout";
import { coreZones } from "../zones";

const STATES: IssueVisualState[] = ["open", "overdue", "answered", "closed", "unknown"];

function issues(count: number, state?: IssueVisualState): WorldEntity[] {
  return Array.from({ length: count }, (_, index): WorldEntity => ({
    id: `issue:${index}`,
    externalId: String(index),
    type: "issue",
    title: `Issue ${index}`,
    source: "aps",
    projectId: "p",
    metadata: { visualState: state ?? STATES[index % STATES.length] },
  }));
}

describe("issue bays", () => {
  it("places every loaded issue in exactly one bay", () => {
    const entities = issues(50);
    const offsets = issueMarkerOffsets(layoutIssueBays(entities));
    expect(offsets.size).toBe(50);
  });

  it("keeps every cone inside its painted bay, even when one state holds them all", () => {
    for (const count of [1, 7, 26, 50]) {
      for (const state of STATES) {
        for (const bay of layoutIssueBays(issues(count, state))) {
          for (const marker of bay.markers) {
            const reach = CONE_FOOTPRINT * bay.coneScale / 2;
            expect(Math.abs(marker.offset[0]) + reach).toBeLessThanOrEqual(bay.size[0] / 2 + 0.001);
            expect(Math.abs(marker.offset[1]) + reach).toBeLessThanOrEqual(bay.size[1] / 2 + 0.001);
          }
        }
      }
    }
  });

  it("never lets a bay marking grow past its slot", () => {
    for (const bay of layoutIssueBays(issues(50, "open"))) {
      expect(bay.size[0]).toBeLessThanOrEqual(ISSUE_BAY_SLOT[0]);
      expect(bay.size[1]).toBeLessThanOrEqual(ISSUE_BAY_SLOT[1]);
    }
  });

  it("sizes the bay marking to the records it actually holds", () => {
    const quiet = layoutIssueBays(issues(2, "open")).find((bay) => bay.state === "open")!;
    const busy = layoutIssueBays(issues(40, "open")).find((bay) => bay.state === "open")!;
    expect(busy.size[1]).toBeGreaterThan(quiet.size[1]);
  });

  it("keeps cones separately clickable while a bay has room", () => {
    const bay = layoutIssueBays(issues(12, "open")).find((item) => item.state === "open")!;
    const offsets = bay.markers.map((marker) => marker.offset);
    for (let first = 0; first < offsets.length; first += 1) {
      for (let second = first + 1; second < offsets.length; second += 1) {
        const distance = Math.hypot(offsets[first][0] - offsets[second][0], offsets[first][1] - offsets[second][1]);
        expect(distance).toBeGreaterThan(CONE_FOOTPRINT * bay.coneScale);
      }
    }
  });

  it("keeps every bay inside the issues district", () => {
    const district = coreZones().find((zone) => zone.id === "issues")!.size;
    for (const [, center] of Object.entries(ISSUE_BAY_CENTERS)) {
      expect(Math.abs(center[0]) + ISSUE_BAY_SLOT[0] / 2).toBeLessThanOrEqual(district[0] / 2);
      expect(Math.abs(center[1]) + ISSUE_BAY_SLOT[1] / 2).toBeLessThanOrEqual(district[1] / 2);
    }
  });

  it("keeps bay slots from overlapping each other", () => {
    const centers = Object.values(ISSUE_BAY_CENTERS);
    for (let first = 0; first < centers.length; first += 1) {
      for (let second = first + 1; second < centers.length; second += 1) {
        const apartX = Math.abs(centers[first][0] - centers[second][0]) >= ISSUE_BAY_SLOT[0];
        const apartZ = Math.abs(centers[first][1] - centers[second][1]) >= ISSUE_BAY_SLOT[1];
        expect(apartX || apartZ).toBe(true);
      }
    }
  });
});
