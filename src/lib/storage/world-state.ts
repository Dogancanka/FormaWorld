import "server-only";

import type { WorldSnapshot } from "@/world/progression/snapshot";
import { XP_PER_ACKNOWLEDGEMENT } from "@/world/progression/xp";
import { readRecord, updateRecord } from "./file-store";

/**
 * Everything FormaWorld remembers about one reader in one project.
 *
 * Deliberately not project data: no titles, no assignees, no document names.
 * The world reads those from APS on every reconciliation and would rather show
 * an honest error than a stale copy. What is kept is what APS cannot answer —
 * how far this reader has got, which digest lines they have already dealt with,
 * and the state their last visit ended on.
 */
export const PROGRESS_NAMESPACE = "progress";

/** A stored snapshot larger than this is refused rather than trusted. */
export const MAX_SNAPSHOT_BYTES = 1_000_000;

export interface ReaderProjectState {
  version: 1;
  xp: number;
  /**
   * Digest line IDs already answered. Line IDs name the kind of news rather
   * than its contents, so they recur between visits and are cleared whenever a
   * new snapshot is stored — an acknowledgement settles one visit, not forever.
   */
  acknowledged: string[];
  lastVisitAt: number;
  snapshot?: WorldSnapshot;
}

const EMPTY: ReaderProjectState = { version: 1, xp: 0, acknowledged: [], lastVisitAt: 0 };

function stateKey(readerId: string, projectId: string): string {
  return `${readerId} ${projectId}`;
}

function normalise(stored: ReaderProjectState | undefined): ReaderProjectState {
  if (!stored || stored.version !== 1) return { ...EMPTY };
  return {
    version: 1,
    xp: Number.isFinite(stored.xp) && stored.xp > 0 ? Math.floor(stored.xp) : 0,
    acknowledged: Array.isArray(stored.acknowledged)
      ? stored.acknowledged.filter((id): id is string => typeof id === "string").slice(0, 64)
      : [],
    lastVisitAt: Number.isFinite(stored.lastVisitAt) ? stored.lastVisitAt : 0,
    snapshot: stored.snapshot?.version === 1 ? stored.snapshot : undefined,
  };
}

export async function loadReaderState(readerId: string, projectId: string): Promise<ReaderProjectState> {
  return normalise(await readRecord<ReaderProjectState>(PROGRESS_NAMESPACE, stateKey(readerId, projectId)));
}

/**
 * Acknowledge one digest line. The XP is decided here, and only the first
 * acknowledgement of a line pays, so a browser cannot inflate its own level by
 * replaying the request.
 */
export async function acknowledgeEvent(
  readerId: string,
  projectId: string,
  eventId: string,
): Promise<ReaderProjectState> {
  return updateRecord<ReaderProjectState>(PROGRESS_NAMESPACE, stateKey(readerId, projectId), (current) => {
    const state = normalise(current);
    if (state.acknowledged.includes(eventId)) return state;
    return {
      ...state,
      xp: state.xp + XP_PER_ACKNOWLEDGEMENT,
      acknowledged: [...state.acknowledged, eventId].slice(-64),
    };
  });
}

/**
 * Close a visit. The stored snapshot becomes the baseline the next arrival is
 * diffed against, so the acknowledgements that settled *this* visit are cleared
 * with it — the next digest is new news and has to be answered again.
 */
export async function storeSnapshot(
  readerId: string,
  projectId: string,
  snapshot: WorldSnapshot,
): Promise<ReaderProjectState> {
  return updateRecord<ReaderProjectState>(PROGRESS_NAMESPACE, stateKey(readerId, projectId), (current) => {
    const state = normalise(current);
    return { ...state, acknowledged: [], lastVisitAt: snapshot.capturedAt, snapshot };
  });
}
