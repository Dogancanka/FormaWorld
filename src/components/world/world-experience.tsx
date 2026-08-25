"use client";

import dynamic from "next/dynamic";
import type { WorldProjectRef } from "@/world/multi-project";

const WorldCanvas = dynamic(() => import("./world-canvas"), {
  ssr: false,
  loading: () => (
    <div className="world-loading">
      <span />
      <p>Building project world…</p>
    </div>
  ),
});

export function WorldExperience({ projects }: { projects: WorldProjectRef[] }) {
  return <WorldCanvas projects={projects} />;
}
