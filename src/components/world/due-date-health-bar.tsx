"use client";

import { Html } from "@react-three/drei";
import type { WorldEntity } from "@/world/entities";
import { dueHealthLabel, entityDueHealth, type DueHealth } from "@/world/rules/due-date";
import { SmokePlume } from "./smoke";

/**
 * A due date read as a health bar, floating above the object it belongs to.
 *
 * A record with no due date renders nothing at all — an empty bar would claim
 * the world knows a deadline it does not have. Every record that *has* one shows
 * its bar, healthy ones included, so the yard can be read at a glance rather
 * than only its problems.
 *
 * That only works because the ambient chip is tiny: a bar on a dark plate, no
 * text. The first build put a labelled white card over every dated record and
 * the issues yard turned into a wall of overlapping boxes with no cones left
 * visible. The numeric reading belongs to the one marker the pointer is on,
 * which is what `detailed` is for.
 *
 * The chip is an overlay, so it is inert to the pointer: the cone or the board
 * underneath stays hoverable and clickable straight through it.
 */
export function DueDateHealthBar({
  entity,
  y = .9,
  detailed = false,
  now,
}: {
  entity: WorldEntity;
  /** Height above the marker's own origin. */
  y?: number;
  /** Show the numeric reading, not just the bar. */
  detailed?: boolean;
  now?: number;
}) {
  const health = entityDueHealth(entity, now);
  if (!health) return null;
  return (
    <Html
      position={[0, y, 0]}
      center
      pointerEvents="none"
      zIndexRange={[2, 0]}
      style={{ pointerEvents: "none" }}
    >
      <div
        className={`due-health state-${health.state}${detailed ? " detailed" : ""}`}
        title={`Due ${new Date(health.dueDate).toLocaleDateString()}`}
      >
        <i><b style={{ width: `${Math.round(health.ratio * 100)}%` }} /></i>
        {detailed && <span>{dueHealthLabel(health)}</span>}
      </div>
    </Html>
  );
}

/**
 * The 3D half of an overdue marker: it burns. Rendered only past the date, so a
 * healthy yard stays clear and the smoke reads as a real alarm.
 */
export function OverdueSmoke({ entity, y = .34, now }: { entity: WorldEntity; y?: number; now?: number }) {
  const health = entityDueHealth(entity, now);
  if (health?.state !== "overdue") return null;
  return (
    <group position={[0, y, 0]}>
      {/* Pale, not dark: the issues yard is dark asphalt, and the first tint was
          a charcoal grey that vanished into the ground it stood on. */}
      <SmokePlume tint="#e2dbcd" scale={.95} speed={.5} rise={.8} opacity={.62} />
    </group>
  );
}

/** Exported for the panel, which shows the same reading next to the record. */
export type { DueHealth };
