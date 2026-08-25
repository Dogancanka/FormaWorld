import type { ApsRecord, WorldEntity, WorldEntityType } from "../entities/world-entity";

export function asRecord(value: unknown): ApsRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as ApsRecord)
    : {};
}

export function optionalText(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" || typeof value === "boolean") return String(value);
  }
  return undefined;
}

export function requiredExternalId(type: WorldEntityType, record: ApsRecord): string {
  const externalId = optionalText(record.id, record.autodeskId);
  if (!externalId) throw new Error(`Cannot adapt APS ${type}: missing external ID.`);
  return externalId;
}

export function entityId(type: WorldEntityType, externalId: string): string {
  return `${type}:${externalId}`;
}

export function metadata(raw: ApsRecord): WorldEntity["metadata"] {
  return { raw };
}
