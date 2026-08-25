import { NextResponse } from "next/server";
import { ApsApiError } from "@/lib/aps/client";
import { listWorldForms } from "@/lib/aps/forms";
import { getSession } from "@/lib/session";
import type { FormFeed, FormFeedState } from "@/world/forms/types";

function failureState(status: number): FormFeedState {
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
    const result = await listWorldForms(session.selectedProject);
    const feed: FormFeed = {
      state: result.total > 0 ? "available" : "empty",
      ...result,
    };
    console.info(`World Forms probe: ${feed.state}; total=${feed.total}; rendered=${feed.entities.length}`);
    return NextResponse.json(feed);
  } catch (cause) {
    const status = cause instanceof ApsApiError ? cause.status : 500;
    const feed: FormFeed = {
      state: failureState(status),
      entities: [],
      total: 0,
      limit: 25,
      httpStatus: status,
      error: cause instanceof Error ? cause.message : "Forms could not be loaded.",
    };
    console.info(`World Forms probe: ${feed.state}; http=${status}`);
    return NextResponse.json(feed);
  }
}
