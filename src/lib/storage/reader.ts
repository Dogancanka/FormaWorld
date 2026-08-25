import "server-only";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { APS_API_BASE_URL } from "@/lib/aps/config";

/**
 * Who saved progress belongs to.
 *
 * The honest answer is the Autodesk account, so a reader's level follows them to
 * another browser or machine. Reading that account requires the User Profile
 * API, which many APS applications are not registered for, and asking for a
 * scope the app may not hold would break sign-in for everyone to benefit a
 * progress bar. So the account is *attempted* and never required: when APS
 * answers, progress is keyed to the account; when it does not, it is keyed to a
 * long-lived cookie and stays with this browser.
 *
 * Grant `user-profile:read` in the APS developer portal and add it to
 * `APS_EXTRA_SCOPES` to get the stable identity.
 */
export const READER_COOKIE = "formaworld_reader";
const READER_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export interface ReaderIdentity {
  id: string;
  /** True when the id came from the Autodesk account rather than this browser. */
  stable: boolean;
}

interface ApsProfile {
  userId?: string;
  userName?: string;
  emailId?: string;
}

/**
 * Ask APS who the token belongs to. Returns undefined for every failure —
 * including the expected 403 when the application lacks the profile scope —
 * because no answer here is ever worth failing a sign-in over.
 */
export async function fetchApsUserId(accessToken: string): Promise<string | undefined> {
  try {
    const response = await fetch(`${APS_API_BASE_URL}/userprofile/v1/users/@me`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return undefined;
    const profile = (await response.json()) as ApsProfile;
    const id = profile.userId ?? profile.emailId;
    return typeof id === "string" && id.trim() ? id.trim() : undefined;
  } catch {
    return undefined;
  }
}

/** The browser-scoped fallback id, creating one if this browser has none. */
export async function readerCookieId(): Promise<{ id: string; created: boolean }> {
  const store = await cookies();
  const existing = store.get(READER_COOKIE)?.value;
  if (existing && /^[0-9a-f-]{36}$/.test(existing)) return { id: existing, created: false };
  return { id: randomUUID(), created: true };
}

export const readerCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: READER_COOKIE_MAX_AGE,
} as const;
