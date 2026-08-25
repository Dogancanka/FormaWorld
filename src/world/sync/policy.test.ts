import { describe, expect, it } from "vitest";
import {
  ACTIVE_SYNC_INTERVAL_MS,
  BACKGROUND_SYNC_INTERVAL_MS,
  shouldRefreshOnVisibilityChange,
  syncIntervalForVisibility,
} from "./policy";

describe("world sync policy", () => {
  it("polls active worlds every 30 seconds", () => {
    expect(syncIntervalForVisibility("visible")).toBe(ACTIVE_SYNC_INTERVAL_MS);
  });

  it("backs off while the tab is hidden", () => {
    expect(syncIntervalForVisibility("hidden")).toBe(BACKGROUND_SYNC_INTERVAL_MS);
  });

  it("refreshes only when a hidden world becomes visible", () => {
    expect(shouldRefreshOnVisibilityChange("hidden", "visible")).toBe(true);
    expect(shouldRefreshOnVisibilityChange("visible", "visible")).toBe(false);
    expect(shouldRefreshOnVisibilityChange("visible", "hidden")).toBe(false);
  });
});
