export const ACTIVE_SYNC_INTERVAL_MS = 30_000;
export const BACKGROUND_SYNC_INTERVAL_MS = 120_000;

export type WorldSyncTrigger = "initial" | "interval" | "manual" | "visible" | "online";

export function syncIntervalForVisibility(visibility: DocumentVisibilityState): number {
  return visibility === "visible" ? ACTIVE_SYNC_INTERVAL_MS : BACKGROUND_SYNC_INTERVAL_MS;
}

export function shouldRefreshOnVisibilityChange(
  previous: DocumentVisibilityState,
  current: DocumentVisibilityState,
): boolean {
  return previous !== "visible" && current === "visible";
}
