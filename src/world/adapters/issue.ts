import type { AdapterContext, ApsRecord, WorldEntity } from "../entities/world-entity";
import { entityId, metadata, optionalText, requiredExternalId } from "./shared";

export function adaptApsIssue(raw: ApsRecord, context: AdapterContext): WorldEntity {
  const externalId = requiredExternalId("issue", raw);
  return {
    id: entityId("issue", externalId),
    externalId,
    type: "issue",
    title: optionalText(raw.title, raw.displayId) ?? externalId,
    status: optionalText(raw.status),
    source: "aps",
    projectId: context.projectId,
    metadata: metadata(raw),
  };
}
