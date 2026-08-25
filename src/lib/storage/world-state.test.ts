import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { WorldSnapshot } from "@/world/progression/snapshot";
import { XP_PER_ACKNOWLEDGEMENT } from "@/world/progression/xp";
import { acknowledgeEvent, loadReaderState, storeSnapshot } from "./world-state";

const READER = "aps:12345";
const PROJECT = "b.11111111-2222-3333-4444-555555555555";

let directory: string;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "formaworld-store-"));
  process.env.FORMAWORLD_DATA_DIR = directory;
});

afterAll(async () => {
  delete process.env.FORMAWORLD_DATA_DIR;
  await rm(directory, { recursive: true, force: true });
});

function snapshot(capturedAt: number, issues: Record<string, string>): WorldSnapshot {
  return { version: 1, capturedAt, issues, assets: {}, rfis: {}, forms: {}, people: [] };
}

describe("reader project state", () => {
  it("starts a reader who has never visited at zero", async () => {
    const state = await loadReaderState(READER, PROJECT);
    expect(state).toMatchObject({ xp: 0, acknowledged: [], lastVisitAt: 0 });
    expect(state.snapshot).toBeUndefined();
  });

  it("survives being written and read back", async () => {
    await acknowledgeEvent(READER, PROJECT, "away:issues-closed");
    const state = await loadReaderState(READER, PROJECT);
    expect(state.xp).toBe(XP_PER_ACKNOWLEDGEMENT);
    expect(state.acknowledged).toEqual(["away:issues-closed"]);
  });

  it("pays for a line only once, however often it is replayed", async () => {
    await acknowledgeEvent(READER, PROJECT, "away:issues-closed");
    await acknowledgeEvent(READER, PROJECT, "away:issues-closed");
    expect((await loadReaderState(READER, PROJECT)).xp).toBe(XP_PER_ACKNOWLEDGEMENT);
  });

  it("keeps one reader's progress out of another's", async () => {
    await acknowledgeEvent("aps:99999", PROJECT, "away:issues-closed");
    expect((await loadReaderState(READER, PROJECT)).xp).toBe(XP_PER_ACKNOWLEDGEMENT);
    expect((await loadReaderState("aps:99999", PROJECT)).xp).toBe(XP_PER_ACKNOWLEDGEMENT);
  });

  it("keeps one project's progress out of another's", async () => {
    expect((await loadReaderState(READER, "b.other")).xp).toBe(0);
  });

  it("clears the answered lines when a visit closes, but never the level", async () => {
    const closed = snapshot(1_800_000_000_000, { "issue:i1": "open" });
    const after = await storeSnapshot(READER, PROJECT, closed);
    expect(after.acknowledged).toEqual([]);
    expect(after.xp).toBe(XP_PER_ACKNOWLEDGEMENT);
    expect(after.lastVisitAt).toBe(closed.capturedAt);
  });

  it("hands the stored snapshot back as the next visit's baseline", async () => {
    const state = await loadReaderState(READER, PROJECT);
    expect(state.snapshot).toMatchObject({ version: 1, issues: { "issue:i1": "open" } });
  });

  it("survives concurrent acknowledgements without losing one", async () => {
    const reader = "aps:concurrent";
    await Promise.all([
      acknowledgeEvent(reader, PROJECT, "away:issues-closed"),
      acknowledgeEvent(reader, PROJECT, "away:issues-overdue"),
      acknowledgeEvent(reader, PROJECT, "away:assets-moved"),
    ]);
    const state = await loadReaderState(reader, PROJECT);
    expect(state.acknowledged.sort()).toEqual([
      "away:assets-moved",
      "away:issues-closed",
      "away:issues-overdue",
    ]);
    expect(state.xp).toBe(3 * XP_PER_ACKNOWLEDGEMENT);
  });
});
