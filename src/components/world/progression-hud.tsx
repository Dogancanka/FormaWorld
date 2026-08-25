"use client";

import { useEffect, useRef, useState } from "react";
import type { AwayEvent } from "@/world/progression/away-log";
import type { ProgressionState } from "@/world/progression/store";

/**
 * The XP meter. It reads as a status line rather than a game badge, so it sits
 * in the same off-white language as the inspector on the right: a level, the
 * progress inside that level, and a bar. The only motion is a short glow when
 * XP actually arrives — enough to notice, not enough to keep pulling the eye.
 */
export function XpMeter({ progression }: { progression: ProgressionState }) {
  const [celebrating, setCelebrating] = useState(false);
  const [floating, setFloating] = useState<{ amount: number; serial: number }>();
  const previousSerial = useRef(progression.gainSerial);

  useEffect(() => {
    if (progression.gainSerial === previousSerial.current) return;
    previousSerial.current = progression.gainSerial;
    setCelebrating(true);
    setFloating({ amount: progression.lastGain, serial: progression.gainSerial });
    const timer = window.setTimeout(() => setCelebrating(false), 900);
    return () => window.clearTimeout(timer);
  }, [progression.gainSerial, progression.lastGain]);

  return (
    <div className={`xp-meter${celebrating ? " gaining" : ""}`} aria-live="polite">
      <span className="xp-line">
        <b>Level {progression.level}</b>
        <em>{progression.intoLevel} / {progression.span} XP</em>
      </span>
      <i className="xp-track"><s style={{ width: `${Math.round(progression.ratio * 100)}%` }} /></i>
      {floating && celebrating && <u key={floating.serial} className="xp-float">+{floating.amount}</u>}
    </div>
  );
}

/**
 * The arrival digest.
 *
 * A headline is a claim, so every line has to be able to prove it: the row body
 * is a button that flies to the district, rings those exact records in the world
 * and filters the inspector to them. Acknowledging is the second step and the
 * one that pays — it was the only step at first, which asked the reader to take
 * "4 issues went overdue" on trust and gave them no way to find the four.
 *
 * An empty list collapses the panel entirely instead of leaving an empty frame
 * on the world.
 */
export function AwayLog({
  events,
  activeEventId,
  arrival,
  onReveal,
  onAcknowledge,
  onDismiss,
}: {
  events: AwayEvent[];
  /** The line currently being shown in the world. */
  activeEventId?: string;
  /**
   * True on a first visit, when there is no earlier snapshot to diff against.
   * The panel then describes the site being walked into and says so, because
   * calling the present state "news" would be the one lie the digest must not
   * tell.
   */
  arrival?: boolean;
  onReveal: (event: AwayEvent) => void;
  onAcknowledge: (event: AwayEvent) => void;
  onDismiss: () => void;
}) {
  if (events.length === 0) return null;
  return (
    <section className="away-log" aria-label={arrival ? "Arriving on site" : "While you were away"}>
      <header>
        <span>{arrival ? "ARRIVING ON SITE…" : "WHILE YOU WERE AWAY…"}</span>
        <button type="button" onClick={onDismiss} aria-label="Dismiss the digest">×</button>
      </header>
      <ul>
        {events.map((event) => {
          const active = activeEventId === event.id;
          return (
            <li key={event.id} className={active ? "revealed" : undefined}>
              <button
                className="away-reveal"
                type="button"
                onClick={() => onReveal(event)}
                aria-pressed={active}
                title={`Show these ${event.entityIds.length} records in the world`}
              >
                <i className={`away-mark kind-${event.kind}`} aria-hidden="true" />
                <span>
                  <strong>{event.headline}</strong>
                  <small>{event.detail}</small>
                </span>
                <em>{active ? "Showing" : "Show"}</em>
              </button>
              <button className="away-ack" type="button" onClick={() => onAcknowledge(event)}>
                Acknowledge <b>+{event.xp}</b>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
