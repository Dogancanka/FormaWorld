import { NextResponse } from "next/server";
import { ApsApiError } from "@/lib/aps/client";
import { listWorldAssets } from "@/lib/aps/assets";
import { getSession, resolveWorldProject } from "@/lib/session";
import type { AssetFeed, AssetFeedState } from "@/world/assets/types";

export async function GET(request: Request) {
  const session = await getSession();
  // Each compound in the world asks for its own project by ID. An unnamed
  // request means the primary project, which is how a single-project world and
  // every pre-existing client keep working unchanged.
  const project = resolveWorldProject(session, new URL(request.url).searchParams.get("projectId"));
  if (!project) {
    return NextResponse.json({ error: "Select a project first." }, { status: 409 });
  }
  try {
    const data = await listWorldAssets(project);
    const feed: AssetFeed = {
      state: data.total > 0 ? "available" : "empty",
      entities: data.entities,
      total: data.total,
      limit: data.limit,
      statuses: data.statuses,
      categories: data.categories,
    };
    console.info(`World Assets probe: ${feed.state}; total=${feed.total}; rendered=${feed.entities.length}; statuses=${feed.statuses.length}; categories=${feed.categories.length}`);
    return NextResponse.json(feed);
  } catch (cause) {
    const status = cause instanceof ApsApiError ? cause.status : 500;
    const state: AssetFeedState = status === 403
      ? "permission_denied"
      : status === 404 || status === 405 || status === 501
        ? "unsupported"
        : "error";
    const feed: AssetFeed = {
      state,
      entities: [],
      total: 0,
      limit: 25,
      statuses: [],
      categories: [],
      httpStatus: status,
      error: cause instanceof Error ? cause.message : "Assets could not be loaded from APS.",
    };
    console.info(`World Assets probe: ${feed.state}; http=${status}`);
    return NextResponse.json(feed);
  }
}
