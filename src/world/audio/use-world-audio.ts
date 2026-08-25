"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { worldAudio, type WorldSound } from "./world-audio";

/**
 * The sound switch, and a way to ask for a tone without caring whether sound is
 * on. `play` is a no-op while it is off, so callers never have to check.
 */
export function useWorldAudio() {
  const enabled = useSyncExternalStore(
    worldAudio.subscribe,
    () => worldAudio.isEnabled(),
    () => false,
  );

  useEffect(() => {
    // Restores a reader who had it on. Browsers refuse to start audio before a
    // gesture, so this only takes effect once they have touched the page.
    worldAudio.hydrate();
  }, []);

  const toggle = useCallback(() => worldAudio.toggle(), []);
  const play = useCallback((sound: WorldSound) => worldAudio.play(sound), []);
  return { enabled, toggle, play };
}
