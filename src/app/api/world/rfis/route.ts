import { NextResponse } from "next/server";
import { ApsApiError } from "@/lib/aps/client";
import { listWorldRfis } from "@/lib/aps/rfis";
import { getSession } from "@/lib/session";
import type { RfiFeed, RfiFeedState } from "@/world/rfis/types";

function failureState(status: number): RfiFeedState {
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
    const result = await listWorldRfis(session.selectedProject);
    const feed: RfiFeed = {
      state: result.total > 0 ? "available" : "empty",
      ...result,
    };
    console.info(`World RFIs probe: ${feed.state}; total=${feed.total}; rendered=${feed.entities.length}`);
    return NextResponse.json(feed);
  } catch (cause) {
    const status = cause instanceof ApsApiError ? cause.status : 500;
    const feed: RfiFeed = {
      state: failureState(status),
      entities: [],
      total: 0,
      limit: 50,
      httpStatus: status,
      error: cause instanceof Error ? cause.message : "RFIs could not be loaded.",
    };
    console.info(`World RFIs probe: ${feed.state}; http=${status}`);
    return NextResponse.json(feed);
  }
}
