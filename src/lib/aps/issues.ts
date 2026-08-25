import "server-only";

import { ApsApiError, getValidAccessToken, isTransientApsError, mutateApsJson, requestApsJson } from "./client";
import { apsCollection, apsTotal, describeCollection } from "./collection";
import { projectUuid } from "./project-id";
import type { SelectedProject } from "../session";
import { adaptApsIssue } from "@/world/adapters";
import type { ApsRecord, WorldEntity } from "@/world/entities";
import { issueVisualState } from "@/world/rules/issue-state";
import type { CreateIssueInput, IssueSubtypeOption } from "@/world/issues/write-types";
import type { WorldActionCapability } from "@/world/actions/types";

type JsonObject = Record<string, unknown>;
const ISSUE_LIMIT = 50;
/**
 * A large issue page was timing out at the APS gateway for busy projects, which
 * lost the whole district. If the gateway gives up, the same request is tried
 * again with a smaller page: fewer issues shown is far better than none, and the
 * authoritative total still comes from the service so the world stays honest
 * about how much of the project it is showing.
 */
const ISSUE_PAGE_FALLBACKS = [ISSUE_LIMIT, 25, 10];

function text(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && Boolean(value.trim()))?.trim();
}

function records(value: unknown): ApsRecord[] {
  return Array.isArray(value)
    ? value.filter((item): item is ApsRecord => Boolean(item && typeof item === "object"))
    : [];
}

export async function listWorldIssues(project: SelectedProject): Promise<{
  entities: WorldEntity[];
  total: number;
  limit: number;
}> {
  const token = await getValidAccessToken();
  const id = encodeURIComponent(projectUuid(project.id));

  let payload: JsonObject | undefined;
  let limit = ISSUE_LIMIT;
  let lastError: unknown;
  for (const candidate of ISSUE_PAGE_FALLBACKS) {
    try {
      payload = await requestApsJson<JsonObject>(
        `/construction/issues/v1/projects/${id}/issues?limit=${candidate}&offset=0`,
        token,
      );
      limit = candidate;
      break;
    } catch (cause) {
      lastError = cause;
      if (!isTransientApsError(cause)) throw cause;
      console.info(`APS Issues page of ${candidate} failed; trying a smaller page.`);
    }
  }
  if (!payload) throw lastError;

  const collection = apsCollection(payload, "results", "data", "issues");
  const rawIssues = collection.records;
  const entities = rawIssues.map((raw) => {
    const entity = adaptApsIssue(raw, { projectId: project.id });
    const visualState = issueVisualState(raw.status, raw.dueDate);
    return {
      ...entity,
      zone: "issues" as const,
      metadata: {
        ...entity.metadata,
        visualState,
        assigned: Boolean(raw.assignedTo || raw.assignedToType),
        overdue: visualState === "overdue",
      },
    };
  });
  const total = apsTotal(payload, rawIssues.length);
  console.info(describeCollection(`APS Issues page (limit ${limit})`, collection, total));
  return { entities, total, limit };
}

export async function listIssueSubtypeOptions(project: SelectedProject): Promise<IssueSubtypeOption[]> {
  const token = await getValidAccessToken();
  const id = encodeURIComponent(projectUuid(project.id));
  const payload = await requestApsJson<JsonObject>(
    `/construction/issues/v1/projects/${id}/issue-types?include=subtypes&limit=100&offset=0`,
    token,
  );
  return records(payload.results).flatMap((issueType) => {
    const parentTitle = text(issueType.title, issueType.name);
    return records(issueType.subtypes).flatMap((subtype): IssueSubtypeOption[] => {
      const subtypeId = text(subtype.id);
      const title = text(subtype.title, subtype.name);
      return subtypeId && title ? [{ id: subtypeId, title, parentTitle }] : [];
    });
  });
}

export async function createWorldIssue(
  project: SelectedProject,
  input: CreateIssueInput,
): Promise<WorldEntity> {
  const token = await getValidAccessToken();
  const id = encodeURIComponent(projectUuid(project.id));
  const raw = await mutateApsJson<ApsRecord>(
    `/construction/issues/v1/projects/${id}/issues`,
    "POST",
    {
      title: input.title,
      description: input.description || undefined,
      issueSubtypeId: input.issueSubtypeId,
      status: "open",
      assignedTo: input.assignedTo || undefined,
      assignedToType: input.assignedTo ? "user" : undefined,
    },
    token,
  );
  const entity = adaptApsIssue(raw, { projectId: project.id });
  return {
    ...entity,
    zone: "issues",
    metadata: {
      ...entity.metadata,
      visualState: issueVisualState(raw.status, raw.dueDate),
      assigned: Boolean(raw.assignedTo || raw.assignedToType),
      overdue: false,
    },
  };
}

function issueResult(value: unknown): ApsRecord | undefined {
  if (!value || typeof value !== "object") return undefined;
  const object = value as JsonObject;
  const candidate = object.results ?? object.result ?? object;
  return candidate && typeof candidate === "object" && !Array.isArray(candidate) ? candidate as ApsRecord : undefined;
}

export async function getIssueStatusCapability(
  project: SelectedProject,
  issueId: string,
): Promise<{ raw: ApsRecord; capability?: WorldActionCapability }> {
  const token = await getValidAccessToken();
  const id = encodeURIComponent(projectUuid(project.id));
  const externalId = encodeURIComponent(issueId);
  const raw = issueResult(await requestApsJson<unknown>(
    `/construction/issues/v1/projects/${id}/issues/${externalId}`,
    token,
  ));
  if (!raw) throw new Error("APS returned no issue details.");
  const permittedAttributes = Array.isArray(raw.permittedAttributes)
    ? raw.permittedAttributes.filter((item): item is string => typeof item === "string")
    : [];
  const permittedStatuses = Array.isArray(raw.permittedStatuses)
    ? raw.permittedStatuses.filter((item): item is string => typeof item === "string" && Boolean(item))
    : [];
  const current = text(raw.status);
  const options = [...new Set(permittedStatuses)]
    .filter((status) => status !== current)
    .map((status) => ({ value: status, label: status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) }));
  const canEditStatus = permittedAttributes.includes("status");
  return {
    raw,
    capability: canEditStatus && options.length ? {
      kind: "set_status",
      label: "Change issue status",
      description: "Move this issue to another APS-permitted workflow state.",
      fieldLabel: "New status",
      currentValue: current,
      options,
    } : undefined,
  };
}

export async function updateWorldIssueStatus(
  project: SelectedProject,
  issueId: string,
  status: string,
): Promise<WorldEntity> {
  const { capability } = await getIssueStatusCapability(project, issueId);
  if (!capability?.options.some((option) => option.value === status)) {
    throw new ApsApiError("This issue status is not permitted for the current user.", 403);
  }
  const token = await getValidAccessToken();
  const id = encodeURIComponent(projectUuid(project.id));
  const externalId = encodeURIComponent(issueId);
  await mutateApsJson<unknown>(
    `/construction/issues/v1/projects/${id}/issues/${externalId}`,
    "PATCH",
    { status },
    token,
  );
  const refreshed = await getIssueStatusCapability(project, issueId);
  const entity = adaptApsIssue(refreshed.raw, { projectId: project.id });
  const visualState = issueVisualState(refreshed.raw.status, refreshed.raw.dueDate);
  return { ...entity, zone: "issues", metadata: { ...entity.metadata, visualState, assigned: Boolean(refreshed.raw.assignedTo || refreshed.raw.assignedToType), overdue: visualState === "overdue" } };
}
