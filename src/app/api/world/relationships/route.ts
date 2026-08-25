import { NextResponse } from "next/server";
import { ApsApiError } from "@/lib/aps/client";
import { listWorldRelationships } from "@/lib/aps/relationships";
import { getSession } from "@/lib/session";
import type { RelationshipFeed, RelationshipFeedState } from "@/world/relationships/types";

function failureState(status: number): RelationshipFeedState {
  if (status === 403) return "permission_denied";
  if ([404, 405, 501].includes(status)) return "unsupported";
  return "error";
}

export async function GET() {
  const session = await getSession();
  if (!session.selectedProject) {
    return NextResponse.json({ error: "Select a project first." }, { status: 409 });
  }
  try {
    const result = await listWorldRelationships(session.selectedProject);
    const feed: RelationshipFeed = {
      state: result.total > 0 ? "available" : "empty",
      ...result,
    };
    return NextResponse.json(feed);
  } catch (cause) {
    const status = cause instanceof ApsApiError ? cause.status : 500;
    const feed: RelationshipFeed = {
      state: failureState(status),
      relationships: [],
      total: 0,
      httpStatus: status,
      error: cause instanceof Error ? cause.message : "Relationships could not be loaded.",
    };
    return NextResponse.json(feed);
  }
}
