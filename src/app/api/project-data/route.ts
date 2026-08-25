import { NextResponse } from "next/server";
import { ApsApiError } from "@/lib/aps/client";
import { inspectProject } from "@/lib/aps/project-data";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session.selectedProject) {
    return NextResponse.json({ error: "Select a project first." }, { status: 409 });
  }
  try {
    const results = await inspectProject(session.selectedProject);
    console.info(
      "APS capability probe:",
      Object.fromEntries(Object.entries(results).map(([id, value]) => [id, value.state])),
    );
    return NextResponse.json({ project: session.selectedProject, results });
  } catch (cause) {
    const status = cause instanceof ApsApiError ? cause.status : 500;
    const error = cause instanceof Error ? cause.message : "Projektdata kunne ikke hentes.";
    return NextResponse.json({ error }, { status });
  }
}
