import { NextResponse } from "next/server";
import { ApsApiError } from "@/lib/aps/client";
import { listWorldAssets } from "@/lib/aps/assets";
import { getSession } from "@/lib/session";
import type { AssetFeed, AssetFeedState } from "@/world/assets/types";

export async function GET() {
  const session = await getSession();
  if (!session.selectedProject) {
    return NextResponse.json({ error: "Select a project first." }, { status: 409 });
  }
  try {
    const data = await listWorldAssets(session.selectedProject);
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
