import { NextResponse } from "next/server";
import { ApsApiError } from "@/lib/aps/client";
import { listWorldPeople } from "@/lib/aps/people";
import { getSession } from "@/lib/session";
import type { PeopleFeed, PeopleFeedState } from "@/world/people/types";

function failureState(status: number): PeopleFeedState {
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
    const result = await listWorldPeople(session.selectedProject);
    const feed: PeopleFeed = {
      state: result.total > 0 ? "available" : "empty",
      ...result,
    };
    console.info(`World People probe: ${feed.state}; total=${feed.total}; rendered=${feed.entities.length}`);
    return NextResponse.json(feed);
  } catch (cause) {
    const status = cause instanceof ApsApiError ? cause.status : 500;
    const feed: PeopleFeed = {
      state: failureState(status),
      entities: [],
      total: 0,
      limit: 100,
      httpStatus: status,
      error: cause instanceof Error ? cause.message : "Project users could not be loaded.",
    };
    console.info(`World People probe: ${feed.state}; http=${status}`);
    return NextResponse.json(feed);
  }
}
