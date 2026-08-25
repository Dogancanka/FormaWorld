import type { ExecuteWorldActionInput } from "./types";

const mutableTypes = new Set(["asset", "issue", "form"]);
const actionKinds = new Set(["set_status", "submit_form"]);

export function validateWorldActionInput(value: unknown): ExecuteWorldActionInput | undefined {
  if (!value || typeof value !== "object") return undefined;
  const body = value as Record<string, unknown>;
  const entityType = typeof body.entityType === "string" ? body.entityType : "";
  const entityId = typeof body.entityId === "string" ? body.entityId.trim() : "";
  const kind = typeof body.kind === "string" ? body.kind : "";
  const actionValue = typeof body.value === "string" ? body.value.trim() : "";
  if (!mutableTypes.has(entityType) || !entityId || entityId.length > 200 || !actionKinds.has(kind) || !actionValue || actionValue.length > 200) return undefined;
  if (entityType === "form" && kind !== "submit_form") return undefined;
  if (entityType !== "form" && kind !== "set_status") return undefined;
  return { entityType, entityId, kind, value: actionValue } as ExecuteWorldActionInput;
}
