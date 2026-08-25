"use client";

import { useEffect, useState } from "react";
import type { HubSummary, ProjectSummary } from "@/lib/aps/types";

export function ProjectPicker({ hubs }: { hubs: HubSummary[] }) {
  const [hubId, setHubId] = useState(hubs[0]?.id ?? "");
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(Boolean(hubs[0]));
  const [error, setError] = useState<string>();
  const activeHub = hubs.find((hub) => hub.id === hubId);

  useEffect(() => {
    if (!hubId) return;
    const controller = new AbortController();
    fetch(`/api/hubs/${encodeURIComponent(hubId)}/projects`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        const payload = (await response.json()) as { projects?: ProjectSummary[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Could not load projects.");
        setProjects(payload.projects ?? []);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "Could not load projects.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [hubId]);

  if (hubs.length === 0) {
    return (
      <section className="notice">
        <strong>No hubs found</strong>
        <p>Check your access to Autodesk Docs/Forma and the app’s Custom Integration.</p>
      </section>
    );
  }

  return (
    <section className="picker-layout">
      <div className="picker-sidebar">
        <p className="step-label"><span>1</span> Hub / account</p>
        <div className="hub-list" role="list">
          {hubs.map((hub) => (
            <button
              className={`hub-option ${hub.id === hubId ? "active" : ""}`}
              key={hub.id}
              onClick={() => {
                setLoading(true);
                setError(undefined);
                setProjects([]);
                setHubId(hub.id);
              }}
              type="button"
            >
              <span className="hub-icon">H</span>
              <span><strong>{hub.name}</strong><small>Autodesk hub / account</small></span>
            </button>
          ))}
        </div>
      </div>
      <div className="project-panel">
        <p className="step-label"><span>2</span> Project</p>
        <h2>{activeHub?.name}</h2>
        {loading && <p className="status-message">Loading projects from Autodesk…</p>}
        {error && <div className="notice error" role="alert">{error}</div>}
        {!loading && !error && projects.length === 0 && (
          <p className="status-message">No available projects in this hub.</p>
        )}
        <div className="project-list">
          {projects.map((project) => (
            <form action="/api/projects/select" method="post" key={project.id}>
              <input type="hidden" name="hubId" value={hubId} />
              <input type="hidden" name="projectId" value={project.id} />
              <button className="project-row" type="submit">
                <span className="project-symbol">◇</span>
                <span><strong>{project.name}</strong><small>Forma / Autodesk project</small></span>
                <span className="row-arrow" aria-hidden="true">→</span>
              </button>
            </form>
          ))}
        </div>
      </div>
    </section>
  );
}
