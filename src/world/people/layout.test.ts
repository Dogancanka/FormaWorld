import { describe, expect, it } from "vitest";
import { layoutPeople } from "./layout";

describe("people entity lane", () => {
  it.each([
    [1, [6.4, 5.4]],
    [24, [6.4, 5.4]],
    [60, [9.6, 8.2]],
    [100, [12.8, 11]],
  ] as Array<[number, [number, number]]>)("keeps %i people inside the front lane", (count, size) => {
    const layout = layoutPeople(count, size);
    expect(layout.offsets).toHaveLength(count);
    for (const [x, z] of layout.offsets) {
      expect(Math.abs(x)).toBeLessThanOrEqual(size[0] / 2 - 0.45);
      expect(z).toBeGreaterThanOrEqual(0);
      expect(z).toBeLessThanOrEqual(size[1] / 2 - 0.64);
    }
  });
});
