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
  /**
   * The project the world treats as primary: the one a write action is created
   * against and the one saved progress is keyed to. Always the first entry of
   * `selectedProjects` once a selection has been made.
   */
  selectedProject?: SelectedProject;
  /**
   * Every project rendered in the world, each as its own walled compound.
   *
   * Absent on sessions created before multi-project selection existed, which is
   * why `worldProjects` reads through to `selectedProject` rather than making
   * everyone pick again.
   */
  selectedProjects?: SelectedProject[];
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

/**
 * Whether this session may attempt an APS write.
 *
 * An *empty* scope list means "APS did not tell us", not "APS refused". Older
 * sessions recorded an empty list whenever the token response omitted `scope`,
 * and the strict check turned that silence into a permanent block with a "sign
 * in again" that produced the same silence. Autodesk is the authority on what a
 * token may do, so an unknown scope set is allowed through to APS, which
 * answers with a real 403 if the grant truly lacks it. A list that is present
 * and lacks `data:write` is still refused here — that one is a real answer.
 */
export function sessionMayWrite(session: Pick<SessionData, "grantedScopes">): boolean {
  const scopes = session.grantedScopes;
  if (!scopes || scopes.length === 0) return true;
  return scopes.includes("data:write");
}

/** How many compounds one world will hold before it stops being an overview. */
export const MAX_WORLD_PROJECTS = 6;

/**
 * Every project this session wants in the world, oldest field first.
 *
 * A session saved before multi-project selection only has `selectedProject`, so
 * that is read as a one-project world rather than an empty one.
 */
export function worldProjects(
  session: Pick<SessionData, "selectedProject" | "selectedProjects">,
): SelectedProject[] {
  const many = session.selectedProjects?.filter((project) => project?.id);
  if (many && many.length > 0) return many.slice(0, MAX_WORLD_PROJECTS);
  return session.selectedProject ? [session.selectedProject] : [];
}

/**
 * The project a feed request is asking for.
 *
 * A request may only name a project this session actually selected. Anything
 * else — a guessed ID, a project from another hub, a stale tab after the
 * selection changed — resolves to nothing rather than being fetched, so the
 * world can never read a project the reader did not choose in this session.
 */
export function resolveWorldProject(
  session: Pick<SessionData, "selectedProject" | "selectedProjects">,
  projectId: string | null,
): SelectedProject | undefined {
  const projects = worldProjects(session);
  if (!projectId) return projects[0];
  return projects.find((project) => project.id === projectId);
}
