import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getApsConfig } from "@/lib/aps/config";
import { buildAuthorizationUrl } from "@/lib/aps/oauth";
import { getSession } from "@/lib/session";

export async function GET(request: Request) {
  try {
    const state = randomBytes(32).toString("base64url");
    const session = await getSession();
    session.oauthState = state;
    await session.save();
    return NextResponse.redirect(buildAuthorizationUrl(getApsConfig(), state));
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Autodesk login kunne ikke startes.";
    return NextResponse.redirect(new URL(`/?authError=${encodeURIComponent(message)}`, request.url));
  }
}
