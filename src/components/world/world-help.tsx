"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * How to drive the world.
 *
 * The controls used to be a strip of four hints that faded out ten seconds
 * after arrival and could never be brought back — fine for the reader who
 * happened to be looking, useless for the one who was not, and no help at all
 * once the mouse buttons changed meaning. This is the same information as a
 * panel that can be opened, closed, and left closed.
 *
 * It opens by itself the first time somebody visits and never again: closing it
 * is remembered, so a reader who knows the controls is not shown them daily.
 */
const STORAGE_KEY = "formaworld:help-dismissed";

interface Shortcut {
  keys: string;
  what: string;
}

const MOUSE: Shortcut[] = [
  { keys: "Left click", what: "Inspect a record, district or project" },
  { keys: "Double click", what: "Frame what you clicked" },
  { keys: "Right drag", what: "Move around the world" },
  { keys: "Scroll", what: "Zoom in and out" },
];

const KEYS: Shortcut[] = [
  { keys: "Esc", what: "Close the panel, then clear the selection" },
  { keys: "?", what: "Show or hide this list" },
];

function remembered(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "yes";
  } catch {
    // A blocked localStorage costs the reader nothing worse than seeing this
    // panel again, so it is not worth failing over.
    return false;
  }
}

export function useWorldHelp() {
  // Read once, at mount. The whole canvas is loaded with `ssr: false`, so there
  // is no server render to disagree with and no need to open this from an
  // effect afterwards.
  const [open, setOpen] = useState(() => !remembered());

  const close = useCallback(() => {
    setOpen(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, "yes");
    } catch {
      // See `remembered`.
    }
  }, []);

  const toggle = useCallback(() => setOpen((current) => {
    if (current) {
      try {
        window.localStorage.setItem(STORAGE_KEY, "yes");
      } catch {
        // See `remembered`.
      }
      return false;
    }
    return true;
  }), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Not while somebody is typing a title into the issue composer.
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.key === "?") {
        event.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggle]);

  return { open, close, toggle };
}

export function WorldHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <aside className="world-help" aria-label="How to control the world">
      <button className="world-help-close" type="button" onClick={onClose} aria-label="Hide the controls">×</button>
      <span className="world-help-kicker">CONTROLS</span>
      <section>
        <h3>Mouse</h3>
        <dl>
          {MOUSE.map((row) => (
            <div key={row.keys}><dt>{row.keys}</dt><dd>{row.what}</dd></div>
          ))}
        </dl>
      </section>
      <section>
        <h3>Keyboard</h3>
        <dl>
          {KEYS.map((row) => (
            <div key={row.keys}><dt>{row.keys}</dt><dd>{row.what}</dd></div>
          ))}
        </dl>
      </section>
      <p>Closing this remembers it. The <b>?</b> button in the top bar brings it back.</p>
    </aside>
  );
}
