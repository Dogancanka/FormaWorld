import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { requestHasSameOrigin } from "@/world/issues/write-validation";
import {
  MAX_SNAPSHOT_BYTES,
  acknowledgeEvent,
  loadReaderState,
  storeSnapshot,
} from "@/lib/storage/world-state";
import type { WorldSnapshot } from "@/world/progression/snapshot";

/**
 * The reader's own state: level, answered digest lines, and the snapshot their
 * last visit ended on. None of it is project data — it is what APS cannot
 * answer — so it lives on this server rather than being read back from Autodesk.
 */

export async function GET() {
  const session = await getSession();
  if (!session.accessToken) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!session.selectedProject) return NextResponse.json({ error: "Select a project first." }, { status: 409 });
  if (!session.readerId) {
    // A session created before progress existed has no owner to store under.
    // Reporting it plainly beats silently starting everyone back at level 1.
    return NextResponse.json({ error: "Sign in again to enable saved progress.", requiresReauthentication: true }, { status: 409 });
  }

  const state = await loadReaderState(session.readerId, session.selectedProject.id);
  return NextResponse.json({
    xp: state.xp,
    acknowledged: state.acknowledged,
    snapshot: state.snapshot ?? null,
    lastVisitAt: state.lastVisitAt,
    readerStable: Boolean(session.readerStable),
  });
}

interface ProgressRequest {
  acknowledge?: unknown;
  snapshot?: unknown;
}

function validSnapshot(value: unknown): value is WorldSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<WorldSnapshot>;
  return (
    candidate.version === 1 &&
    typeof candidate.capturedAt === "number" &&
    Number.isFinite(candidate.capturedAt) &&
    typeof candidate.issues === "object" &&
    typeof candidate.assets === "object" &&
    typeof candidate.rfis === "object" &&
    typeof candidate.forms === "object" &&
    Array.isArray(candidate.people)
  );
}

export async function POST(request: Request) {
  if (!requestHasSameOrigin(request.url, request.headers.get("origin"))) {
    return NextResponse.json({ error: "Cross-origin write refused." }, { status: 403 });
  }
  const session = await getSession();
  if (!session.accessToken) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!session.selectedProject) return NextResponse.json({ error: "Select a project first." }, { status: 409 });
  if (!session.readerId) {
    return NextResponse.json({ error: "Sign in again to enable saved progress.", requiresReauthentication: true }, { status: 409 });
  }

  const body = (await request.json().catch(() => undefined)) as ProgressRequest | undefined;
  if (!body) return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });

  const projectId = session.selectedProject.id;

  if (typeof body.acknowledge === "string" && body.acknowledge.startsWith("away:")) {
    // The XP is not in the request. The server decides what a line is worth and
    // pays only for the first acknowledgement of it.
    const state = await acknowledgeEvent(session.readerId, projectId, body.acknowledge.slice(0, 64));
    return NextResponse.json({ xp: state.xp, acknowledged: state.acknowledged });
  }

  if (body.snapshot !== undefined) {
    if (!validSnapshot(body.snapshot)) {
      return NextResponse.json({ error: "Snapshot is not in a shape this server stores." }, { status: 400 });
    }
    if (JSON.stringify(body.snapshot).length > MAX_SNAPSHOT_BYTES) {
      return NextResponse.json({ error: "Snapshot is too large to store." }, { status: 413 });
    }
    const state = await storeSnapshot(session.readerId, projectId, body.snapshot);
    return NextResponse.json({ xp: state.xp, acknowledged: state.acknowledged, lastVisitAt: state.lastVisitAt });
  }

  return NextResponse.json({ error: "Provide an acknowledgement or a snapshot." }, { status: 400 });
}
