import { NextResponse } from "next/server";
import { ApsApiError, listHubs, listProjects } from "@/lib/aps/client";
import { getSession } from "@/lib/session";

export async function POST(request: Request) {
  const form = await request.formData();
  const hubId = form.get("hubId");
  const projectId = form.get("projectId");
  if (typeof hubId !== "string" || typeof projectId !== "string") {
    return NextResponse.json({ error: "Invalid project selection." }, { status: 400 });
  }

  try {
    const [hubs, projects] = await Promise.all([listHubs(), listProjects(hubId)]);
    const hub = hubs.find((candidate) => candidate.id === hubId);
    const project = projects.find((candidate) => candidate.id === projectId);
    if (!hub || !project) {
      return NextResponse.json(
        { error: "That project is not available to the current Autodesk user." },
        { status: 403 },
      );
    }
    const session = await getSession();
    session.selectedProject = {
      id: project.id,
      name: project.name,
      hubId: hub.id,
      hubName: hub.name,
    };
    await session.save();
    return NextResponse.redirect(new URL("/project", request.url), 303);
  } catch (cause) {
    const status = cause instanceof ApsApiError ? cause.status : 500;
    const error = cause instanceof Error ? cause.message : "The project could not be selected.";
    return NextResponse.json({ error }, { status });
  }
}
