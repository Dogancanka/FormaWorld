import "server-only";

import { cookies } from "next/headers";
import { getIronSession, type IronSession } from "iron-session";

export interface SelectedProject {
  id: string;
  name: string;
  hubId: string;
  hubName: string;
}

export interface SessionData {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  grantedScopes?: string[];
  oauthState?: string;
  selectedProject?: SelectedProject;
  /**
   * Who saved progress belongs to. Prefixed with its source so a browser-scoped
   * fallback id can never be mistaken for an Autodesk account id.
   */
  readerId?: string;
  /** True when `readerId` came from the Autodesk account rather than a cookie. */
  readerStable?: boolean;
}

function getSessionPassword(): string {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 characters.");
  }
  return password;
}

export async function getSession(): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(await cookies(), {
    cookieName: "formaworld_session",
    password: getSessionPassword(),
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 14,
    },
  });
}
