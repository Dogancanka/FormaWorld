import { NextResponse } from "next/server";
import { ApsApiError } from "@/lib/aps/client";
import { getAssetStatusCapability, updateWorldAssetStatus } from "@/lib/aps/assets";
import { getFormSubmitCapability, submitWorldForm } from "@/lib/aps/forms";
import { getIssueStatusCapability, updateWorldIssueStatus } from "@/lib/aps/issues";
import { getSession, sessionMayWrite } from "@/lib/session";
import type { WorldEntityType } from "@/world/entities";
import type { ExecuteWorldActionResult, WorldActionOptions } from "@/world/actions/types";
import { validateWorldActionInput } from "@/world/actions/validation";
import { requestHasSameOrigin } from "@/world/issues/write-validation";

const mutableTypes = new Set<WorldEntityType>(["asset", "issue", "form"]);

function failureStatus(cause: unknown): number {
  return cause instanceof ApsApiError ? cause.status : 500;
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session.selectedProject) return NextResponse.json({ error: "Select a project first." }, { status: 409 });
  const url = new URL(request.url);
  const entityType = url.searchParams.get("entityType") as WorldEntityType | null;
  const entityId = url.searchParams.get("entityId")?.trim();
  if (!entityType || !mutableTypes.has(entityType) || !entityId) {
    return NextResponse.json({ error: "Provide a supported entity type and APS entity ID." }, { status: 400 });
  }
  const writeScopeGranted = sessionMayWrite(session);
  if (!writeScopeGranted) {
    const result: WorldActionOptions = { state: "read_only", entityType, entityId, writeScopeGranted, capabilities: [], error: "Sign in again to grant APS data:write access." };
    return NextResponse.json(result);
  }
  try {
    const capability = entityType === "asset"
      ? (await getAssetStatusCapability(session.selectedProject, entityId)).capability
      : entityType === "issue"
        ? (await getIssueStatusCapability(session.selectedProject, entityId)).capability
        : (await getFormSubmitCapability(session.selectedProject, entityId)).capability;
    const result: WorldActionOptions = {
      state: capability ? "available" : "read_only",
      entityType,
      entityId,
      writeScopeGranted,
      capabilities: capability ? [capability] : [],
      error: capability ? undefined : "No APS-permitted workflow action is available for this record.",
    };
    return NextResponse.json(result);
  } catch (cause) {
    const status = failureStatus(cause);
    const result: WorldActionOptions = {
      state: [404, 405, 501].includes(status) ? "unsupported" : status === 403 ? "read_only" : "error",
      entityType,
      entityId,
      writeScopeGranted,
      capabilities: [],
      error: cause instanceof Error ? cause.message : "World actions could not be loaded from APS.",
    };
    return NextResponse.json(result);
  }
}

export async function POST(request: Request) {
  if (!requestHasSameOrigin(request.url, request.headers.get("origin"))) return NextResponse.json({ error: "Cross-origin mutation refused." }, { status: 403 });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return NextResponse.json({ error: "Content-Type must be application/json." }, { status: 415 });
  const session = await getSession();
  if (!session.selectedProject) return NextResponse.json({ error: "Select a project first." }, { status: 409 });
  if (!sessionMayWrite(session)) return NextResponse.json({ error: "This session was granted read-only APS access. Sign in again to grant data:write.", requiresReauthentication: true }, { status: 403 });
  const input = validateWorldActionInput(await request.json().catch(() => undefined));
  if (!input) return NextResponse.json({ error: "Provide a supported action, APS entity ID, and value." }, { status: 400 });
  try {
    const entity = input.entityType === "asset"
      ? await updateWorldAssetStatus(session.selectedProject, input.entityId, input.value)
      : input.entityType === "issue"
        ? await updateWorldIssueStatus(session.selectedProject, input.entityId, input.value)
        : await submitWorldForm(session.selectedProject, input.entityId);
    const result: ExecuteWorldActionResult = { entity, confirmedByAps: true };
    return NextResponse.json(result);
  } catch (cause) {
    const status = failureStatus(cause);
    return NextResponse.json({
      error: cause instanceof Error ? cause.message : "APS did not complete the action.",
      requiresReauthentication: status === 401 || status === 403,
    }, { status });
  }
}
