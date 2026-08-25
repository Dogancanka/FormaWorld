import { describe, expect, it } from "vitest";
import { zonePositions, zonesOverlap } from "./layout";
import { worldZones } from "./zones";

describe("world layout", () => {
  it("places every district at its declared position", () => {
    const zones = worldZones();
    const positions = zonePositions(zones);
    for (const zone of zones) expect(positions[zone.id]).toEqual(zone.position);
  });

  it("returns a fresh copy so no caller can mutate the shared plan", () => {
    const zones = worldZones();
    zonePositions(zones).hub[0] = 999;
    expect(zonePositions(zones).hub).toEqual([0, 0, 0]);
  });

  it.each([
    [12, 9.4],
    [24, 9.4],
    [34, 9.4],
    [43.2, 9.4],
  ] as Array<[number, number]>)("keeps every district clear of the others with a %i-wide asset yard", (width, depth) => {
    const zones = worldZones([width, depth]);
    const positions = zonePositions(zones);
    for (let first = 0; first < zones.length; first += 1) {
      for (let second = first + 1; second < zones.length; second += 1) {
        expect(
          zonesOverlap(zones[first], positions[zones[first].id], zones[second], positions[zones[second].id]),
          `${zones[first].id} overlaps ${zones[second].id}`,
        ).toBe(false);
      }
    }
  });

  it("gives a project exactly one asset district, however many statuses it has", () => {
    expect(worldZones().filter((zone) => zone.kind === "assets")).toHaveLength(1);
  });

  it("detects an overlap when two districts share a centre", () => {
    const zones = worldZones();
    const hub = zones.find((zone) => zone.id === "hub")!;
    const people = zones.find((zone) => zone.id === "people")!;
    expect(zonesOverlap(hub, hub.position, people, hub.position)).toBe(true);
  });
});
