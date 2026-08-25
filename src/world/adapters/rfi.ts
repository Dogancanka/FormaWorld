import type { AdapterContext, ApsRecord, WorldEntity } from "../entities/world-entity";
import { entityId, metadata, optionalText, requiredExternalId } from "./shared";

export function adaptApsRfi(raw: ApsRecord, context: AdapterContext): WorldEntity {
  const externalId = requiredExternalId("rfi", raw);
  return {
    id: entityId("rfi", externalId),
    externalId,
    type: "rfi",
    title: optionalText(raw.title, raw.subject, raw.customIdentifier, raw.identifier) ?? externalId,
    status: optionalText(raw.status),
    source: "aps",
    projectId: context.projectId,
    metadata: metadata(raw),
  };
}
