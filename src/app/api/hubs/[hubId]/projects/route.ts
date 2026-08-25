import { NextResponse } from "next/server";
import { ApsApiError, listProjects } from "@/lib/aps/client";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/hubs/[hubId]/projects">,
) {
  try {
    const { hubId } = await context.params;
    return NextResponse.json({ projects: await listProjects(hubId) });
  } catch (cause) {
    const status = cause instanceof ApsApiError ? cause.status : 500;
    const error = cause instanceof Error ? cause.message : "Kunne ikke hente projekter.";
    return NextResponse.json({ error }, { status });
  }
}
