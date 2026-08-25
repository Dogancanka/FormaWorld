import { describe, expect, it } from "vitest";
import { levelProgress, levelSpan } from "./xp";

describe("levelSpan", () => {
  it("charges more for each level", () => {
    expect(levelSpan(1)).toBe(250);
    expect(levelSpan(2)).toBe(500);
    expect(levelSpan(3)).toBe(750);
  });
});

describe("levelProgress", () => {
  it("starts at level one with an empty bar", () => {
    expect(levelProgress(0)).toEqual({ level: 1, intoLevel: 0, span: 250, ratio: 0 });
  });

  it("carries the remainder into the next level", () => {
    // 250 finishes level 1, so the remaining 150 sits inside level 2.
    expect(levelProgress(400)).toEqual({ level: 2, intoLevel: 150, span: 500, ratio: 0.3 });
  });

  it("levels up exactly on the boundary", () => {
    expect(levelProgress(250).level).toBe(2);
    expect(levelProgress(249).level).toBe(1);
    expect(levelProgress(750).level).toBe(3);
  });

  it("never reports negative or fractional progress", () => {
    expect(levelProgress(-50)).toEqual({ level: 1, intoLevel: 0, span: 250, ratio: 0 });
    expect(levelProgress(99.9).intoLevel).toBe(99);
  });
});
