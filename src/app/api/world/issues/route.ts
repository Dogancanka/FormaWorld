import { NextResponse } from "next/server";
import { ApsApiError } from "@/lib/aps/client";
import { createWorldIssue, listIssueSubtypeOptions, listWorldIssues } from "@/lib/aps/issues";
import { getSession, resolveWorldProject, sessionMayWrite } from "@/lib/session";
import type { IssueFeed, IssueFeedState } from "@/world/issues/types";
import type { CreateIssueInput, CreateIssueResult } from "@/world/issues/write-types";
import { requestHasSameOrigin, validateCreateIssueInput } from "@/world/issues/write-validation";
import { listWorldPeople } from "@/lib/aps/people";

function failureState(status: number): IssueFeedState {
  if (status === 403) return "permission_denied";
  if ([404, 405, 501].includes(status)) return "unsupported";
  return "error";
}

export async function GET(request: Request) {
  const session = await getSession();
  const project = resolveWorldProject(session, new URL(request.url).searchParams.get("projectId"));
  if (!project) {
    return NextResponse.json({ error: "Select a project first." }, { status: 409 });
  }

  try {
    const result = await listWorldIssues(project);
    const feed: IssueFeed = {
      state: result.total > 0 ? "available" : "empty",
      ...result,
    };
    console.info(`World Issues probe: ${feed.state}; total=${feed.total}; rendered=${feed.entities.length}`);
    return NextResponse.json(feed);
  } catch (cause) {
    const status = cause instanceof ApsApiError ? cause.status : 500;
    const feed: IssueFeed = {
      state: failureState(status),
      entities: [],
      total: 0,
      limit: 50,
      httpStatus: status,
      error: cause instanceof Error ? cause.message : "Issues could not be loaded.",
    };
    console.info(`World Issues probe: ${feed.state}; http=${status}`);
    return NextResponse.json(feed);
  }
}

export async function POST(request: Request) {
  if (!requestHasSameOrigin(request.url, request.headers.get("origin"))) return NextResponse.json({ error: "Cross-origin mutation refused." }, { status: 403 });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: "Content-Type must be application/json." }, { status: 415 });
  }
  const session = await getSession();
  if (!sessionMayWrite(session)) {
    return NextResponse.json({
      error: "This session does not include the APS data:write scope. Sign in again before creating an issue.",
      requiresReauthentication: true,
    }, { status: 403 });
  }
  const body = await request.json().catch(() => undefined) as Record<string, unknown> | undefined;
  // A world can hold several compounds, so the issue is written into the one
  // the composer was opened from rather than into whichever project happens to
  // be primary. An unnamed project still means the primary one.
  const project = resolveWorldProject(session, typeof body?.projectId === "string" ? body.projectId : null);
  if (!project) return NextResponse.json({ error: "Select a project first." }, { status: 409 });
  const input: CreateIssueInput | undefined = validateCreateIssueInput(body);
  if (!input) return NextResponse.json({ error: "Provide a title, valid issue subtype, and optional description." }, { status: 400 });
  try {
    const allowedSubtypes = await listIssueSubtypeOptions(project);
    if (!allowedSubtypes.some((subtype) => subtype.id === input.issueSubtypeId)) {
      return NextResponse.json({ error: "The selected issue subtype is not available in this project." }, { status: 400 });
    }
    if (input.assignedTo) {
      const projectPeople = await listWorldPeople(project);
      const assigneeExists = projectPeople.entities.some((person) => {
        const raw = person.metadata.raw && typeof person.metadata.raw === "object"
          ? person.metadata.raw as Record<string, unknown>
          : {};
        return input.assignedTo === person.externalId || input.assignedTo === raw.autodeskId;
      });
      if (!assigneeExists) return NextResponse.json({ error: "The selected assignee is not a loaded member of this project." }, { status: 400 });
    }
    const issue = await createWorldIssue(project, input);
    const result: CreateIssueResult = { issue, confirmedByAps: true };
    return NextResponse.json(result, { status: 201 });
  } catch (cause) {
    const status = cause instanceof ApsApiError ? cause.status : 500;
    return NextResponse.json({
      error: cause instanceof Error ? cause.message : "APS did not create the issue.",
      requiresReauthentication: status === 401 || status === 403,
    }, { status });
  }
}
