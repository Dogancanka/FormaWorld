"use client";

import { useEffect, useState } from "react";
import type { HubSummary, ProjectSummary } from "@/lib/aps/types";

/** Mirrors MAX_WORLD_PROJECTS on the server, which enforces it. */
const MAX_PROJECTS = 6;

export function ProjectPicker({ hubs }: { hubs: HubSummary[] }) {
  const [hubId, setHubId] = useState(hubs[0]?.id ?? "");
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
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

  const atLimit = chosen.length >= MAX_PROJECTS;
  const toggle = (projectId: string) => {
    setChosen((current) => current.includes(projectId)
      ? current.filter((id) => id !== projectId)
      : current.length < MAX_PROJECTS ? [...current, projectId] : current);
  };

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
                // Projects belong to a hub, so a hub change cannot keep a
                // selection made against the previous one.
                setChosen([]);
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
        <p className="step-label"><span>2</span> Projects</p>
        <h2>{activeHub?.name}</h2>
        <p className="picker-hint">
          Pick one project, or several to see them side by side — each becomes its
          own walled compound in the same world. Up to {MAX_PROJECTS}.
        </p>
        {loading && <p className="status-message">Loading projects from Autodesk…</p>}
        {error && <div className="notice error" role="alert">{error}</div>}
        {!loading && !error && projects.length === 0 && (
          <p className="status-message">No available projects in this hub.</p>
        )}
        {projects.length > 0 && (
          <form action="/api/projects/select" method="post">
            <input type="hidden" name="hubId" value={hubId} />
            <div className="project-list">
              {projects.map((project) => {
                const selected = chosen.includes(project.id);
                return (
                  <label
                    className={`project-row${selected ? " selected" : ""}`}
                    key={project.id}
                    data-disabled={!selected && atLimit ? "true" : undefined}
                  >
                    <input
                      type="checkbox"
                      name="projectId"
                      value={project.id}
                      checked={selected}
                      disabled={!selected && atLimit}
                      onChange={() => toggle(project.id)}
                    />
                    <span><strong>{project.name}</strong><small>Forma / Autodesk project</small></span>
                  </label>
                );
              })}
            </div>
            <div className="picker-actions">
              <button className="button primary" type="submit" disabled={chosen.length === 0}>
                {chosen.length > 1 ? `Enter world with ${chosen.length} projects` : "Enter the world"}
                <span aria-hidden="true">→</span>
              </button>
              {atLimit && <small>That is the most a single world will hold.</small>}
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
