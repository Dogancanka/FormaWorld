import "server-only";

import { ApsApiError, getValidAccessToken, requestApsJson } from "./client";
import type { DataSourceId, DataSourceResult, InspectorItem, InspectorResults } from "./inspector-types";
import type { ApsCollection, ApsResource } from "./types";
import { projectUuid } from "./project-id";
import type { SelectedProject } from "../session";

type JsonObject = Record<string, unknown>;

function text(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function array(value: unknown): JsonObject[] {
  return Array.isArray(value)
    ? value.filter((item): item is JsonObject => Boolean(item && typeof item === "object"))
    : [];
}

function result(
  id: DataSourceId,
  items: InspectorItem[],
  count: number,
  availableSummary: string,
): DataSourceResult {
  return {
    id,
    state: count > 0 ? "available" : "empty",
    count,
    summary: count > 0 ? availableSummary : "API'et svarede korrekt, men returnerede ingen data.",
    items,
  };
}

function failure(id: DataSourceId, cause: unknown): DataSourceResult {
  const status = cause instanceof ApsApiError ? cause.status : undefined;
  const state = status === 403
    ? "permission_denied"
    : status === 404 || status === 405 || status === 501
      ? "unsupported"
      : "error";
  return {
    id,
    state,
    count: 0,
    items: [],
    httpStatus: status,
    summary: state === "permission_denied"
      ? "The user or integration has no access to this module."
      : state === "unsupported"
        ? "The module or endpoint is not available for this project."
        : "The APS request failed.",
    error: cause instanceof Error ? cause.message : "Unknown APS error.",
  };
}

async function probe(
  id: DataSourceId,
  operation: () => Promise<DataSourceResult>,
): Promise<DataSourceResult> {
  try {
    return await operation();
  } catch (cause) {
    return failure(id, cause);
  }
}

async function documents(project: SelectedProject, token: string): Promise<DataSourceResult> {
  type DocumentResource = ApsResource<{ displayName?: string; name?: string }>;
  const topFolders = await requestApsJson<ApsCollection<DocumentResource>>(
    `/project/v1/hubs/${encodeURIComponent(project.hubId)}/projects/${encodeURIComponent(project.id)}/topFolders`,
    token,
  );
  const firstFolder = topFolders.data[0];
  let entries: DocumentResource[] = [];
  if (firstFolder) {
    const contents = await requestApsJson<ApsCollection<DocumentResource>>(
      `/data/v1/projects/${encodeURIComponent(project.id)}/folders/${encodeURIComponent(firstFolder.id)}/contents?page[limit]=10`,
      token,
    );
    entries = contents.data;
  }
  const items = [...topFolders.data, ...entries].slice(0, 10).map((entry) => ({
    id: entry.id,
    title: entry.attributes.displayName ?? entry.attributes.name ?? entry.id,
    details: [{ label: "Type", value: entry.type }],
  }));
  return result("documents", items, topFolders.data.length + entries.length, "Top folders and the first page were read.");
}

async function issues(project: SelectedProject, token: string): Promise<DataSourceResult> {
  const payload = await requestApsJson<JsonObject>(
    `/construction/issues/v1/projects/${encodeURIComponent(projectUuid(project.id))}/issues?limit=10&offset=0`,
    token,
  );
  const records = array(payload.results);
  const pagination = object(payload.pagination);
  const items = records.map((issue) => ({
    id: text(issue.id) ?? "unknown",
    title: text(issue.title) ?? "Untitled issue",
    details: compactDetails([
      ["Status", issue.status],
      ["Assigned to", issue.assignedTo ?? issue.assignedToType],
      ["Due date", issue.dueDate],
      ["Location", issue.locationId],
    ]),
  }));
  const count = Number(pagination.totalResults ?? records.length);
  return result("issues", items, count, `APS returned ${count} issue${count === 1 ? "" : "s"}.`);
}

async function assets(project: SelectedProject, token: string): Promise<DataSourceResult> {
  const payload = await requestApsJson<JsonObject>(
    `/bim360/assets/v2/projects/${encodeURIComponent(projectUuid(project.id))}/assets?limit=10&offset=0`,
    token,
  );
  const records = array(payload.results);
  const pagination = object(payload.pagination);
  const items = records.map((asset) => ({
    id: text(asset.id) ?? "unknown",
    title: text(asset.clientAssetId) ?? text(asset.name) ?? text(asset.description) ?? "Unnamed asset",
    details: compactDetails([
      ["Category", asset.categoryId],
      ["Status", asset.statusId],
      ["Location", asset.locationId],
      ["Barcode", asset.barcode],
    ]),
  }));
  const count = Number(pagination.totalResults ?? records.length);
  return result("assets", items, count, `APS returned ${count} asset${count === 1 ? "" : "s"}.`);
}

async function forms(project: SelectedProject, token: string): Promise<DataSourceResult> {
  const payload = await requestApsJson<JsonObject>(
    `/construction/forms/v2/projects/${encodeURIComponent(projectUuid(project.id))}/forms?limit=10&offset=0`,
    token,
  );
  const records = array(payload.results ?? payload.forms);
  const pagination = object(payload.pagination);
  const items = records.map((form) => ({
    id: text(form.id) ?? "unknown",
    title: text(form.name) ?? text(form.title) ?? text(form.templateName) ?? "Unnamed form",
    details: compactDetails([
      ["Status", form.status],
      ["Type", form.formType ?? form.type],
      ["Template", form.templateId],
      ["Location", form.locationId],
    ]),
  }));
  const count = Number(pagination.totalResults ?? records.length);
  return result("forms", items, count, `APS returned ${count} form${count === 1 ? "" : "s"}.`);
}

async function people(project: SelectedProject, token: string): Promise<DataSourceResult> {
  const payload = await requestApsJson<JsonObject>(
    `/construction/admin/v1/projects/${encodeURIComponent(projectUuid(project.id))}/users?limit=10&offset=0`,
    token,
  );
  const records = array(payload.results);
  const pagination = object(payload.pagination);
  const items = records.map((person) => {
    const fullName = [text(person.firstName), text(person.lastName)].filter(Boolean).join(" ");
    return {
      id: text(person.id) ?? text(person.autodeskId) ?? "unknown",
      title: text(person.name) ?? (fullName || "Unnamed user"),
      details: compactDetails([
        ["E-mail", person.email],
        ["Company", person.companyName ?? object(person.company).name],
        ["Status", person.status],
        ["Autodesk ID", person.autodeskId],
      ]),
    };
  });
  const count = Number(pagination.totalResults ?? records.length);
  return result("people", items, count, `APS returned ${count} project user${count === 1 ? "" : "s"}.`);
}

function compactDetails(entries: Array<[string, unknown]>): InspectorItem["details"] {
  return entries.flatMap(([label, rawValue]) => {
    const value = text(rawValue);
    return value ? [{ label, value }] : [];
  });
}

export async function inspectProject(project: SelectedProject): Promise<InspectorResults> {
  const token = await getValidAccessToken();
  const [documentResult, issueResult, assetResult, formResult, peopleResult] = await Promise.all([
    probe("documents", () => documents(project, token)),
    probe("issues", () => issues(project, token)),
    probe("assets", () => assets(project, token)),
    probe("forms", () => forms(project, token)),
    probe("people", () => people(project, token)),
  ]);
  return {
    documents: documentResult,
    issues: issueResult,
    assets: assetResult,
    forms: formResult,
    people: peopleResult,
  };
}
