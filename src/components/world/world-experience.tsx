"use client";

import dynamic from "next/dynamic";

const WorldCanvas = dynamic(() => import("./world-canvas"), {
  ssr: false,
  loading: () => (
    <div className="world-loading">
      <span />
      <p>Building project world…</p>
    </div>
  ),
});

export function WorldExperience({ projectName, projectId }: { projectName: string; projectId: string }) {
  return <WorldCanvas projectName={projectName} projectId={projectId} />;
}
