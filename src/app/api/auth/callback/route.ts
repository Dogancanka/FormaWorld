import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getApsConfig, getApsScopes } from "@/lib/aps/config";
import { exchangeAuthorizationCode } from "@/lib/aps/oauth";
import { getSession } from "@/lib/session";
import {
  READER_COOKIE,
  fetchApsUserId,
  readerCookieId,
  readerCookieOptions,
} from "@/lib/storage/reader";

function statesMatch(expected: string | undefined, received: string | null): boolean {
  if (!expected || !received) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(received);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const session = await getSession();
  const error = url.searchParams.get("error");
  if (error) {
    const description = url.searchParams.get("error_description") ?? error;
    delete session.oauthState;
    await session.save();
    return NextResponse.redirect(new URL(`/?authError=${encodeURIComponent(description)}`, request.url));
  }

  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!statesMatch(session.oauthState, state) || !code) {
    delete session.oauthState;
    await session.save();
    return NextResponse.redirect(new URL("/?authError=The+OAuth+response+could+not+be+validated.", request.url));
  }

  try {
    const tokens = await exchangeAuthorizationCode(getApsConfig(), code);
    session.accessToken = tokens.access_token;
    session.refreshToken = tokens.refresh_token;
    session.expiresAt = Date.now() + tokens.expires_in * 1000;
    // APS does not always echo `scope` back on the token response. Falling back
    // to what was requested is correct — the authorize step grants the whole
    // set or fails — and recording an empty set instead is what made "Sign in
    // again to grant APS data:write access" a dead end: signing in again
    // produced the same empty set, so write actions never became available.
    session.grantedScopes = tokens.scope?.split(/\s+/).filter(Boolean) ?? getApsScopes();

    // Saved progress needs an owner. The Autodesk account is the honest one, so
    // it is asked for — but never required, because a profile call that fails
    // must not cost anybody their sign-in. See lib/storage/reader.ts.
    const apsUserId = await fetchApsUserId(tokens.access_token);
    const fallback = await readerCookieId();
    session.readerId = apsUserId ? `aps:${apsUserId}` : `browser:${fallback.id}`;
    session.readerStable = Boolean(apsUserId);

    delete session.oauthState;
    delete session.selectedProject;
    await session.save();
    const response = NextResponse.redirect(new URL("/projects", request.url));
    // Written even when the account answered, so progress still has somewhere
    // to land if the profile call fails on a later sign-in.
    response.cookies.set(READER_COOKIE, fallback.id, readerCookieOptions);
    return response;
  } catch (cause) {
    delete session.oauthState;
    await session.save();
    const message = cause instanceof Error ? cause.message : "Token exchange failed.";
    return NextResponse.redirect(new URL(`/?authError=${encodeURIComponent(message)}`, request.url));
  }
}
