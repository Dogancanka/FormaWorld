import { NextResponse } from "next/server";
import { ApsApiError } from "@/lib/aps/client";
import { listIssueSubtypeOptions } from "@/lib/aps/issues";
import { getSession, resolveWorldProject, sessionMayWrite } from "@/lib/session";
import type { IssueCreateOptions } from "@/world/issues/write-types";

export async function GET(request: Request) {
  const session = await getSession();
  const project = resolveWorldProject(session, new URL(request.url).searchParams.get("projectId"));
  if (!project) return NextResponse.json({ error: "Select a project first." }, { status: 409 });
  try {
    const subtypes = await listIssueSubtypeOptions(project);
    const result: IssueCreateOptions = {
      state: subtypes.length ? "available" : "empty",
      subtypes,
      writeScopeGranted: sessionMayWrite(session),
    };
    return NextResponse.json(result);
  } catch (cause) {
    const status = cause instanceof ApsApiError ? cause.status : 500;
    const result: IssueCreateOptions = {
      state: status === 403 ? "permission_denied" : "error",
      subtypes: [],
      writeScopeGranted: sessionMayWrite(session),
      httpStatus: status,
      error: cause instanceof Error ? cause.message : "Issue types could not be loaded.",
    };
    return NextResponse.json(result);
  }
}
