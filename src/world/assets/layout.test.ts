import { describe, expect, it } from "vitest";
import { ASSET_STACK_FOOTPRINT, YARD_DEPTH, YARD_END_WIDTH, layoutAssetYard } from "./layout";
import type { AssetStatusOption } from "../zones";

interface TestAsset { id: string; statusId?: string; group: string; }

function statuses(count: number): AssetStatusOption[] {
  return Array.from({ length: count }, (_, index) => ({ id: `s${index}`, label: `Status ${index}` }));
}

function assets(perStatus: number[], options: { unknown?: number } = {}): TestAsset[] {
  const result: TestAsset[] = [];
  perStatus.forEach((count, statusIndex) => {
    for (let index = 0; index < count; index += 1) {
      result.push({ id: `s${statusIndex}-${index}`, statusId: `s${statusIndex}`, group: `g${index % 3}` });
    }
  });
  for (let index = 0; index < (options.unknown ?? 0); index += 1) {
    result.push({ id: `u-${index}`, statusId: undefined, group: "g0" });
  }
  return result;
}

const statusIdOf = (asset: TestAsset) => asset.statusId;
const groupKeyOf = (asset: TestAsset) => asset.group;

describe("layoutAssetYard", () => {
  it("puts the whole workflow in one yard, one lane per status, in the project's order", () => {
    const plan = layoutAssetYard(statuses(5), assets([2, 2, 2, 2, 2]), statusIdOf, groupKeyOf);
    expect(plan.lanes.map((lane) => lane.statusId)).toEqual(["s0", "s1", "s2", "s3", "s4"]);
    for (let index = 1; index < plan.lanes.length; index += 1) {
      expect(plan.lanes[index].x).toBeGreaterThan(plan.lanes[index - 1].x);
    }
  });

  it("reads left to right: intake before the first lane, dispatch after the last", () => {
    const plan = layoutAssetYard(statuses(4), assets([1, 1, 1, 1]), statusIdOf, groupKeyOf);
    expect(plan.intakeX).toBeLessThan(plan.lanes[0].x);
    expect(plan.dispatchX).toBeGreaterThan(plan.lanes[plan.lanes.length - 1].x);
  });

  it("places every asset exactly once", () => {
    const plan = layoutAssetYard(statuses(3), assets([9, 4, 12], { unknown: 3 }), statusIdOf, groupKeyOf);
    expect(plan.placements).toHaveLength(28);
    expect(new Set(plan.placements.map((item) => item.asset.id)).size).toBe(28);
  });

  it("puts an asset in the lane for its own status", () => {
    const plan = layoutAssetYard(statuses(3), assets([4, 4, 4]), statusIdOf, groupKeyOf);
    for (const { asset, offset } of plan.placements) {
      const lane = plan.lanes.find((candidate) => candidate.statusId === asset.statusId)!;
      expect(Math.abs(offset[0] - lane.x)).toBeLessThanOrEqual(lane.width / 2);
    }
  });

  it("opens an extra lane only when an asset's status is not in the project's set", () => {
    expect(layoutAssetYard(statuses(3), assets([2, 2, 2]), statusIdOf, groupKeyOf).lanes).toHaveLength(3);
    const withUnknown = layoutAssetYard(statuses(3), assets([2, 2, 2], { unknown: 1 }), statusIdOf, groupKeyOf);
    expect(withUnknown.lanes).toHaveLength(4);
    expect(withUnknown.lanes[3].statusId).toBeUndefined();
  });

  it("keeps every stack inside the yard", () => {
    for (const spread of [[1], [30, 2, 2], [20, 20, 20, 20, 20, 20]]) {
      const plan = layoutAssetYard(statuses(spread.length), assets(spread), statusIdOf, groupKeyOf);
      for (const { offset } of plan.placements) {
        expect(Math.abs(offset[0])).toBeLessThanOrEqual(plan.size[0] / 2 - 0.3);
        expect(Math.abs(offset[1])).toBeLessThanOrEqual(YARD_DEPTH / 2 - 0.3);
      }
    }
  });

  it("stands like material together inside a lane", () => {
    const plan = layoutAssetYard(statuses(1), assets([12]), statusIdOf, groupKeyOf);
    const order = plan.placements.map((item) => item.asset.group);
    expect(order).toEqual([...order].sort());
  });

  it("keeps click targets from overlapping while a lane has room", () => {
    const plan = layoutAssetYard(statuses(3), assets([6, 6, 6]), statusIdOf, groupKeyOf);
    const offsets = plan.placements.map((item) => item.offset);
    for (let first = 0; first < offsets.length; first += 1) {
      for (let second = first + 1; second < offsets.length; second += 1) {
        const distance = Math.hypot(offsets[first][0] - offsets[second][0], offsets[first][1] - offsets[second][1]);
        expect(distance).toBeGreaterThan(ASSET_STACK_FOOTPRINT);
      }
    }
  });

  it("grows the yard with the number of statuses but caps how wide it gets", () => {
    const narrow = layoutAssetYard(statuses(2), assets([1, 1]), statusIdOf, groupKeyOf);
    const wide = layoutAssetYard(statuses(6), assets([1, 1, 1, 1, 1, 1]), statusIdOf, groupKeyOf);
    expect(wide.size[0]).toBeGreaterThan(narrow.size[0]);
    expect(layoutAssetYard(statuses(12), [], statusIdOf, groupKeyOf).size[0])
      .toBeLessThanOrEqual(34 + YARD_END_WIDTH * 2);
  });

  it("still gives a yard when the project exposes no statuses", () => {
    const plan = layoutAssetYard([], assets([], { unknown: 4 }), statusIdOf, groupKeyOf);
    expect(plan.lanes).toHaveLength(1);
    expect(plan.placements).toHaveLength(4);
  });
});
