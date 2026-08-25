import { NextResponse } from "next/server";
import { ApsApiError } from "@/lib/aps/client";
import { listWorldDocuments } from "@/lib/aps/documents";
import { getSession } from "@/lib/session";
import type { DocumentFeed, DocumentFeedState } from "@/world/documents/types";

function failureState(status: number): DocumentFeedState {
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
    const result = await listWorldDocuments(session.selectedProject);
    const feed: DocumentFeed = {
      state: result.total > 0 ? "available" : "empty",
      ...result,
    };
    console.info(`World Documents probe: ${feed.state}; rendered=${feed.entities.length}`);
    return NextResponse.json(feed);
  } catch (cause) {
    const status = cause instanceof ApsApiError ? cause.status : 500;
    const feed: DocumentFeed = {
      state: failureState(status),
      entities: [],
      total: 0,
      limit: 25,
      scope: "Top-level folders and the first accessible folder",
      httpStatus: status,
      error: cause instanceof Error ? cause.message : "Documents could not be loaded.",
    };
    console.info(`World Documents probe: ${feed.state}; http=${status}`);
    return NextResponse.json(feed);
  }
}
