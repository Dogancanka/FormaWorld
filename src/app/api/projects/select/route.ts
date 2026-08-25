import { NextResponse } from "next/server";
import { ApsApiError, listHubs, listProjects } from "@/lib/aps/client";
import { MAX_WORLD_PROJECTS, getSession, type SelectedProject } from "@/lib/session";

export async function POST(request: Request) {
  const form = await request.formData();
  const hubId = form.get("hubId");
  // One field, one or many values: the picker posts a checkbox per project, and
  // a single-project submit is just the one-element case of the same form.
  const projectIds = form.getAll("projectId").filter((value): value is string => typeof value === "string");
  if (typeof hubId !== "string" || projectIds.length === 0) {
    return NextResponse.json({ error: "Invalid project selection." }, { status: 400 });
  }
  if (projectIds.length > MAX_WORLD_PROJECTS) {
    return NextResponse.json(
      { error: `A world holds at most ${MAX_WORLD_PROJECTS} projects.` },
      { status: 400 },
    );
  }

  try {
    const [hubs, projects] = await Promise.all([listHubs(), listProjects(hubId)]);
    const hub = hubs.find((candidate) => candidate.id === hubId);
    if (!hub) {
      return NextResponse.json(
        { error: "That hub is not available to the current Autodesk user." },
        { status: 403 },
      );
    }

    // Every requested project is checked against what this Autodesk user can
    // actually see. One unavailable project fails the whole selection rather
    // than silently dropping a compound the reader asked for.
    const selected: SelectedProject[] = [];
    for (const projectId of projectIds) {
      const project = projects.find((candidate) => candidate.id === projectId);
      if (!project) {
        return NextResponse.json(
          { error: "One of those projects is not available to the current Autodesk user." },
          { status: 403 },
        );
      }
      if (selected.some((entry) => entry.id === project.id)) continue;
      selected.push({ id: project.id, name: project.name, hubId: hub.id, hubName: hub.name });
    }

    const session = await getSession();
    session.selectedProjects = selected;
    // The primary is what a write action is created against and what saved
    // progress is keyed to, so it stays a single, stable project.
    session.selectedProject = selected[0];
    await session.save();
    return NextResponse.redirect(new URL("/project", request.url), 303);
  } catch (cause) {
    const status = cause instanceof ApsApiError ? cause.status : 500;
    const error = cause instanceof Error ? cause.message : "The project could not be selected.";
    return NextResponse.json({ error }, { status });
  }
}
