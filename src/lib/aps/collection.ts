import type { ApsRecord } from "@/world/entities";

// APS collection endpoints do not agree on the property that holds the page of
// records: Issues v1 uses `results`, ACC Forms v2 uses `data`, and other
// services use the resource name. Reading only one of them silently renders an
// empty district while the pagination total says the project has records — which
// is exactly how the Forms district came up empty.
//
// This reads the documented key when it is present, falls back to any other
// array of objects on the payload, and always reports which key it used so a
// wrong guess shows up in the server log instead of as a missing district.

export interface ApsCollection {
  records: ApsRecord[];
  /** Payload property the records were read from, for logging. */
  key?: string;
  /** Every top-level key on the payload, reported when nothing could be read. */
  availableKeys: string[];
}

function isRecordArray(value: unknown): value is ApsRecord[] {
  return Array.isArray(value) && value.every((item) => Boolean(item) && typeof item === "object" && !Array.isArray(item));
}

export function apsCollection(payload: unknown, ...preferredKeys: string[]): ApsCollection {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { records: [], availableKeys: [] };
  }
  const object = payload as Record<string, unknown>;
  const availableKeys = Object.keys(object);

  for (const key of preferredKeys) {
    const value = object[key];
    if (isRecordArray(value) && value.length > 0) return { records: value, key, availableKeys };
  }
  // An empty array under a documented key is a real empty page, not a miss.
  for (const key of preferredKeys) {
    if (Array.isArray(object[key])) return { records: [], key, availableKeys };
  }
  for (const key of availableKeys) {
    const value = object[key];
    if (isRecordArray(value) && value.length > 0) return { records: value, key, availableKeys };
  }
  return { records: [], availableKeys };
}

export function apsTotal(payload: unknown, fallback: number): number {
  if (!payload || typeof payload !== "object") return fallback;
  const object = payload as Record<string, unknown>;
  const pagination = object.pagination && typeof object.pagination === "object"
    ? object.pagination as Record<string, unknown>
    : {};
  for (const candidate of [pagination.totalResults, pagination.total, object.totalResults, object.total]) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
  }
  return fallback;
}

/** One line describing what was read, so an unexpected payload shape is visible. */
export function describeCollection(label: string, collection: ApsCollection, total: number): string {
  const source = collection.key ? `key=${collection.key}` : `key=none keys=[${collection.availableKeys.join(",")}]`;
  return `${label}: ${source}; records=${collection.records.length}; total=${total}`;
}
