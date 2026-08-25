"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { WorldSnapshot } from "./snapshot";
import { levelProgress, type LevelProgress } from "./xp";

/**
 * Reader state, global and dependency-free.
 *
 * A store library would work here, but the whole surface is one number, a list
 * of answered digest lines and one snapshot, so `useSyncExternalStore` covers it
 * without adding a package to the bundle. It is a module singleton on purpose:
 * the XP bar, the away log and the action bar all read the same value without
 * threading props through the scene.
 *
 * This used to persist to `localStorage`, which meant a reader's level lived in
 * one browser and "while you were away" had nothing to compare against. It now
 * reads and writes `/api/world/progress`, so the server owns both the XP — a
 * browser cannot award itself any — and the snapshot the next arrival is
 * diffed against. State is per project: progress on one construction site is
 * not progress on another.
 */
export interface ProgressionSnapshot {
  xp: number;
  /** Increments on every award, so the HUD can replay its celebration. */
  gainSerial: number;
  /** XP granted by the most recent award, for the floating "+25". */
  lastGain: number;
  /** Digest lines this reader has already answered in the current visit. */
  acknowledged: string[];
  /** The state their last visit ended on; undefined on a first visit. */
  previousSnapshot?: WorldSnapshot;
  /** False until the server has answered, so the HUD can hold its digest. */
  loaded: boolean;
  /** True when progress is keyed to the Autodesk account, not this browser. */
  readerStable: boolean;
}

const INITIAL: ProgressionSnapshot = {
  xp: 0,
  gainSerial: 0,
  lastGain: 0,
  acknowledged: [],
  loaded: false,
  readerStable: false,
};

let snapshot: ProgressionSnapshot = INITIAL;
let loadedProjectId: string | undefined;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function getSnapshot(): ProgressionSnapshot {
  return snapshot;
}

/** The server component has no reader state, so it always renders a fresh bar. */
function getServerSnapshot(): ProgressionSnapshot {
  return INITIAL;
}

interface ProgressPayload {
  xp?: number;
  acknowledged?: string[];
  snapshot?: WorldSnapshot | null;
  readerStable?: boolean;
}

/**
 * Load this project's saved state. Safe to call on every mount — it returns
 * immediately once a project has been loaded.
 */
export async function hydrateProgression(projectId: string) {
  if (typeof window === "undefined" || loadedProjectId === projectId) return;
  loadedProjectId = projectId;
  try {
    const response = await fetch("/api/world/progress", {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(String(response.status));
    const payload = (await response.json()) as ProgressPayload;
    snapshot = {
      xp: Number.isFinite(payload.xp) ? Number(payload.xp) : 0,
      gainSerial: 0,
      lastGain: 0,
      acknowledged: payload.acknowledged ?? [],
      previousSnapshot: payload.snapshot ?? undefined,
      loaded: true,
      readerStable: Boolean(payload.readerStable),
    };
  } catch {
    // A reader whose progress cannot be reached still gets a world. They see a
    // first-visit digest and a level 1 bar, and nothing is written over the
    // stored state, so the next successful load restores it.
    snapshot = { ...INITIAL, loaded: true };
  }
  emit();
}

/**
 * Acknowledge one digest line. The XP shown is optimistic; the server decides
 * the real number and the reply corrects the bar.
 */
export async function acknowledgeAwayEvent(eventId: string, optimisticXp: number) {
  if (snapshot.acknowledged.includes(eventId)) return;
  snapshot = {
    ...snapshot,
    xp: snapshot.xp + optimisticXp,
    gainSerial: snapshot.gainSerial + 1,
    lastGain: optimisticXp,
    acknowledged: [...snapshot.acknowledged, eventId],
  };
  emit();
  try {
    const response = await fetch("/api/world/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ acknowledge: eventId }),
    });
    if (!response.ok) return;
    const payload = (await response.json()) as ProgressPayload;
    if (typeof payload.xp === "number") {
      snapshot = { ...snapshot, xp: payload.xp, acknowledged: payload.acknowledged ?? snapshot.acknowledged };
      emit();
    }
  } catch {
    // The line stays acknowledged for this visit. The stored state is unchanged,
    // so the digest returns intact rather than silently losing the line.
  }
}

/**
 * Close the visit: store the state the world was left in, which is what the next
 * arrival is diffed against. Uses `sendBeacon` where available because the page
 * is usually going away as this runs.
 */
export function saveVisitSnapshot(worldSnapshot: WorldSnapshot) {
  if (typeof window === "undefined") return;
  const body = JSON.stringify({ snapshot: worldSnapshot });
  try {
    if (navigator.sendBeacon?.(
      "/api/world/progress",
      new Blob([body], { type: "application/json" }),
    )) return;
  } catch {
    // Fall through to fetch.
  }
  void fetch("/api/world/progress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}

export interface ProgressionState extends ProgressionSnapshot, LevelProgress {
  acknowledge: (eventId: string, xp: number) => void;
}

export function useProgression(projectId?: string): ProgressionState {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => {
    if (projectId) void hydrateProgression(projectId);
  }, [projectId]);
  const acknowledge = useCallback(
    (eventId: string, xp: number) => void acknowledgeAwayEvent(eventId, xp),
    [],
  );
  return { ...state, ...levelProgress(state.xp), acknowledge };
}

/** Test seam: forget the loaded project so the next hydrate reads the server again. */
export function resetProgressionForTests() {
  snapshot = INITIAL;
  loadedProjectId = undefined;
  emit();
}
