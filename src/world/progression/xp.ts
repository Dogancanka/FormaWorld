/**
 * A deliberately small progression curve. Each level costs more than the last,
 * so the bar keeps moving early on without a long project turning the number
 * into noise. The span is what the HUD prints after the slash: at 400 total XP
 * a reader sees "Level 2 · 150 / 500 XP".
 */
export const XP_PER_ACKNOWLEDGEMENT = 25;

const FIRST_LEVEL_SPAN = 250;
const LEVEL_SPAN_STEP = 250;
const MAX_LEVEL = 99;

/** XP needed to leave the given level. Level 1 costs 250, level 2 costs 500. */
export function levelSpan(level: number): number {
  return FIRST_LEVEL_SPAN + (Math.max(1, level) - 1) * LEVEL_SPAN_STEP;
}

export interface LevelProgress {
  level: number;
  /** XP earned inside the current level. */
  intoLevel: number;
  /** XP the current level costs in total. */
  span: number;
  /** 0–1, for the width of the bar. */
  ratio: number;
}

export function levelProgress(xp: number): LevelProgress {
  let remaining = Math.max(0, Math.floor(xp));
  let level = 1;
  while (level < MAX_LEVEL && remaining >= levelSpan(level)) {
    remaining -= levelSpan(level);
    level += 1;
  }
  const span = levelSpan(level);
  return { level, intoLevel: remaining, span, ratio: Math.min(1, remaining / span) };
}
