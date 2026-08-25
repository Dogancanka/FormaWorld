import type { AdapterContext, ApsRecord, WorldEntity } from "../entities/world-entity";
import { entityId, metadata, optionalText, requiredExternalId } from "./shared";

export function adaptApsPerson(raw: ApsRecord, context: AdapterContext): WorldEntity {
  const externalId = requiredExternalId("person", raw);
  const fullName = [optionalText(raw.firstName), optionalText(raw.lastName)].filter(Boolean).join(" ");
  return {
    id: entityId("person", externalId),
    externalId,
    type: "person",
    title: optionalText(raw.name, fullName) ?? externalId,
    status: optionalText(raw.status),
    source: "aps",
    projectId: context.projectId,
    metadata: metadata(raw),
  };
}
