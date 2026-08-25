import "server-only";

import { ApsApiError, getValidAccessToken, mutateApsJson, requestApsJson } from "./client";
import { projectUuid } from "./project-id";
import type { SelectedProject } from "../session";
import { adaptApsAsset } from "@/world/adapters";
import type { ApsRecord, WorldEntity } from "@/world/entities";
import { ASSET_ZONE, type AssetStatusOption } from "@/world/zones";
import type { AssetCategoryOption } from "@/world/assets/materials";
import { apsCollection, apsTotal, describeCollection } from "./collection";
import type { WorldActionCapability } from "@/world/actions/types";

type JsonObject = Record<string, unknown>;
// One page of 25 hid most of a real project's assets and, with them, most of
// its categories. Assets are paged instead, up to a bounded display limit; the
// authoritative total still comes from the service so the world can say how much
// of the project it is showing.
const ASSET_PAGE_SIZE = 100;
const ASSET_PAGES = 3;
const ASSET_LIMIT = ASSET_PAGE_SIZE * ASSET_PAGES;

/** Reads up to `ASSET_PAGES` pages, following whichever paging style APS uses. */
async function readAssetPages(id: string, token: string): Promise<{ records: ApsRecord[]; total: number }> {
  const records: ApsRecord[] = [];
  let total = 0;
  let next: string | undefined = `/bim360/assets/v2/projects/${id}/assets?limit=${ASSET_PAGE_SIZE}&includeCustomAttributes=true`;

  for (let page = 0; page < ASSET_PAGES && next; page += 1) {
    const payload: unknown = await requestApsJson<unknown>(next, token);
    const collection = apsCollection(payload, "results", "data");
    total = Math.max(total, apsTotal(payload, records.length + collection.records.length));
    console.info(describeCollection(`APS Assets page ${page + 1}`, collection, total));
    records.push(...collection.records);
    if (collection.records.length < ASSET_PAGE_SIZE) break;

    const pagination = payload && typeof payload === "object"
      ? (payload as Record<string, unknown>).pagination as Record<string, unknown> | undefined
      : undefined;
    const nextUrl = typeof pagination?.nextUrl === "string" ? pagination.nextUrl : undefined;
    const cursorState = typeof pagination?.cursorState === "string" ? pagination.cursorState : undefined;
    next = nextUrl
      ?? (cursorState
        ? `/bim360/assets/v2/projects/${id}/assets?limit=${ASSET_PAGE_SIZE}&includeCustomAttributes=true&cursorState=${encodeURIComponent(cursorState)}`
        : `/bim360/assets/v2/projects/${id}/assets?limit=${ASSET_PAGE_SIZE}&offset=${records.length}&includeCustomAttributes=true`);
  }
  return { records, total: Math.max(total, records.length) };
}

function collectNamedIds(value: unknown, result = new Map<string, string>()): Map<string, string> {
  if (Array.isArray(value)) {
    for (const item of value) collectNamedIds(item, result);
    return result;
  }
  if (!value || typeof value !== "object") return result;
  const object = value as JsonObject;
  const id = typeof object.id === "string" ? object.id : undefined;
  const name = [object.name, object.label, object.title]
    .find((candidate): candidate is string => typeof candidate === "string" && Boolean(candidate.trim()));
  if (id && name) result.set(id, name);
  for (const child of Object.values(object)) collectNamedIds(child, result);
  return result;
}

async function optionalLookup(path: string, token: string): Promise<Map<string, string>> {
  try {
    return collectNamedIds(await requestApsJson<unknown>(path, token));
  } catch {
    return new Map();
  }
}

/**
 * The project's own asset statuses, in the order APS returns them. A project
 * defines its own set — some have three, some have six — and the world renders
 * one district per real status, so this list is the district plan for assets.
 */
async function listNamedOptions(path: string, token: string, label: string): Promise<AssetStatusOption[]> {
  try {
    const payload = await requestApsJson<unknown>(path, token);
    const collection = apsCollection(payload, "results", "data", "statuses", "categories");
    console.info(describeCollection(label, collection, collection.records.length));
    const options: AssetStatusOption[] = [];
    const seen = new Set<string>();
    for (const record of collection.records) {
      const id = typeof record.id === "string" ? record.id : undefined;
      const label = [record.label, record.name, record.title]
        .find((candidate): candidate is string => typeof candidate === "string" && Boolean(candidate.trim()));
      if (!id || !label || seen.has(id)) continue;
      seen.add(id);
      options.push({ id, label: label.trim() });
    }
    return options;
  } catch {
    return [];
  }
}

async function assetContext(project: SelectedProject, assetId?: string) {
  const token = await getValidAccessToken();
  const id = encodeURIComponent(projectUuid(project.id));
  const [payload, statuses] = await Promise.all([
    requestApsJson<JsonObject>(`/bim360/assets/v2/projects/${id}/assets?limit=${ASSET_PAGE_SIZE}&includeCustomAttributes=true`, token),
    optionalLookup(`/bim360/assets/v1/projects/${id}/asset-statuses?limit=200`, token),
  ]);
  const assets = apsCollection(payload, "results", "data").records;
  const raw = assetId ? assets.find((asset) => asset.id === assetId) : undefined;
  return { token, id, raw, statuses };
}

export async function getAssetStatusCapability(project: SelectedProject, assetId: string): Promise<{ raw: ApsRecord; capability?: WorldActionCapability }> {
  const { raw, statuses } = await assetContext(project, assetId);
  if (!raw) throw new ApsApiError("The asset is no longer present in the loaded APS asset set.", 404);
  const currentId = typeof raw.statusId === "string" ? raw.statusId : undefined;
  const options = [...statuses.entries()]
    .filter(([statusId]) => statusId !== currentId)
    .map(([value, label]) => ({ value, label }));
  return {
    raw,
    capability: options.length ? {
      kind: "set_status",
      label: "Change asset status",
      description: "Move this asset to another live project workflow state.",
      fieldLabel: "New status",
      currentValue: currentId ? statuses.get(currentId) ?? currentId : undefined,
      options,
    } : undefined,
  };
}

export async function updateWorldAssetStatus(project: SelectedProject, assetId: string, statusId: string): Promise<WorldEntity> {
  const before = await getAssetStatusCapability(project, assetId);
  const choice = before.capability?.options.find((option) => option.value === statusId);
  if (!choice) throw new ApsApiError("That asset status is not available in this project.", 400);
  const token = await getValidAccessToken();
  const id = encodeURIComponent(projectUuid(project.id));
  await mutateApsJson<unknown>(
    `/bim360/assets/v2/projects/${id}/assets:batch-patch`,
    "PATCH",
    { [assetId]: { statusId } },
    token,
  );
  const after = await getAssetStatusCapability(project, assetId);
  const entity = adaptApsAsset(after.raw, { projectId: project.id });
  return {
    ...entity,
    status: choice.label,
    zone: ASSET_ZONE,
    metadata: { ...entity.metadata, statusName: choice.label, statusId, statusMapped: true },
  };
}

export async function listWorldAssets(project: SelectedProject): Promise<{
  entities: WorldEntity[];
  total: number;
  limit: number;
  statuses: AssetStatusOption[];
  categories: AssetCategoryOption[];
}> {
  const token = await getValidAccessToken();
  const id = encodeURIComponent(projectUuid(project.id));
  const page = await readAssetPages(id, token);
  const [statuses, categories] = await Promise.all([
    listNamedOptions(`/bim360/assets/v1/projects/${id}/asset-statuses?limit=200`, token, "APS asset statuses"),
    listNamedOptions(`/bim360/assets/v1/projects/${id}/categories?limit=200`, token, "APS asset categories"),
  ]);
  const statusLabels = new Map(statuses.map((status) => [status.id, status.label]));
  const categoryLabels = new Map(categories.map((category) => [category.id, category.label]));

  const entities = page.records.map((raw) => {
    const statusId = typeof raw.statusId === "string" ? raw.statusId : undefined;
    const categoryId = typeof raw.categoryId === "string" ? raw.categoryId : undefined;
    const statusName = statusId ? statusLabels.get(statusId) : undefined;
    const categoryName = categoryId ? categoryLabels.get(categoryId) : undefined;
    const entity = adaptApsAsset(raw, { projectId: project.id });
    // Every asset lives in the one Material Yard. Its APS status decides which
    // lane of that yard it stands in, which the world layout works out.
    const resolved = Boolean(statusId && statusLabels.has(statusId));
    const categoryText = [raw.category, raw.categoryName]
      .find((candidate): candidate is string => typeof candidate === "string" && Boolean(candidate.trim()));
    return {
      ...entity,
      status: statusName ?? entity.status,
      zone: ASSET_ZONE,
      metadata: {
        ...entity.metadata,
        statusName,
        statusId,
        categoryId,
        categoryName: categoryName ?? categoryText,
        categoryText,
        statusMapped: resolved,
      },
    };
  });
  return { entities, total: page.total, limit: ASSET_LIMIT, statuses, categories };
}
