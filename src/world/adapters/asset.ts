import type { AdapterContext, ApsRecord, WorldEntity } from "../entities/world-entity";
import { entityId, metadata, optionalText, requiredExternalId } from "./shared";

export function adaptApsAsset(raw: ApsRecord, context: AdapterContext): WorldEntity {
  const externalId = requiredExternalId("asset", raw);
  return {
    id: entityId("asset", externalId),
    externalId,
    type: "asset",
    title: optionalText(raw.clientAssetId, raw.name, raw.description) ?? externalId,
    status: optionalText(raw.status, raw.statusId),
    source: "aps",
    projectId: context.projectId,
    metadata: metadata(raw),
  };
}
