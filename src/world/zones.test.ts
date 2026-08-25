import { describe, expect, it } from "vitest";
import { ASSET_ZONE, coreZones, worldZones } from "./zones";

describe("world districts", () => {
  it("gives every project the same core districts", () => {
    expect(coreZones().map((zone) => zone.id)).toEqual([
      "hub", "documents", "rfis", "issues", "forms", "people",
    ]);
  });

  it("gives a project one asset district, not one per status", () => {
    const assetDistricts = worldZones().filter((zone) => zone.kind === "assets");
    expect(assetDistricts).toHaveLength(1);
    expect(assetDistricts[0].id).toBe(ASSET_ZONE);
    expect(assetDistricts[0].label).toBe("Assets");
  });

  it("takes the yard footprint from the layout so it fits the project's lanes", () => {
    expect(worldZones([30, 9.4]).find((zone) => zone.kind === "assets")!.size).toEqual([30, 9.4]);
  });

  it("gives every district a unique id", () => {
    const ids = worldZones().map((zone) => zone.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
