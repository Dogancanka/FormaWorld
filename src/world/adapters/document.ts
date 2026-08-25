import type { AdapterContext, ApsRecord, WorldEntity } from "../entities/world-entity";
import { asRecord, entityId, metadata, optionalText, requiredExternalId } from "./shared";

export function adaptApsDocument(raw: ApsRecord, context: AdapterContext): WorldEntity {
  const externalId = requiredExternalId("document", raw);
  const attributes = asRecord(raw.attributes);
  return {
    id: entityId("document", externalId),
    externalId,
    type: "document",
    title: optionalText(attributes.displayName, attributes.name, raw.name) ?? externalId,
    source: "aps",
    projectId: context.projectId,
    metadata: metadata(raw),
  };
}
