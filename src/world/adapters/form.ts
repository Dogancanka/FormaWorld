import type { AdapterContext, ApsRecord, WorldEntity } from "../entities/world-entity";
import { entityId, metadata, optionalText, requiredExternalId } from "./shared";

export function adaptApsForm(raw: ApsRecord, context: AdapterContext): WorldEntity {
  const externalId = requiredExternalId("form", raw);
  return {
    id: entityId("form", externalId),
    externalId,
    type: "form",
    title: optionalText(raw.name, raw.title, raw.templateName) ?? externalId,
    status: optionalText(raw.status),
    source: "aps",
    projectId: context.projectId,
    metadata: metadata(raw),
  };
}
