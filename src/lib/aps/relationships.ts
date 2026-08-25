import "server-only";

import { getValidAccessToken, requestApsJson } from "./client";
import { projectUuid } from "./project-id";
import type { SelectedProject } from "../session";
import { relationshipEntityType } from "@/world/relationships/resolve";
import type { ApsWorldRelationship, RelationshipEndpoint } from "@/world/relationships/types";

type JsonObject = Record<string, unknown>;

function objects(value: unknown): JsonObject[] {
  return Array.isArray(value)
    ? value.filter((item): item is JsonObject => Boolean(item && typeof item === "object"))
    : [];
}

export async function listWorldRelationships(project: SelectedProject): Promise<{
  relationships: ApsWorldRelationship[];
  total: number;
}> {
  const token = await getValidAccessToken();
  const id = encodeURIComponent(projectUuid(project.id));
  const payload = await requestApsJson<JsonObject>(
    `/bim360/relationship/v2/containers/${id}/relationships:search`,
    token,
  );
  const relationships = objects(payload.relationships).flatMap((raw, index): ApsWorldRelationship[] => {
    const endpoints = objects(raw.entities).flatMap((entity): RelationshipEndpoint[] => {
      const domain = typeof entity.domain === "string" ? entity.domain : undefined;
      const apsType = typeof entity.type === "string" ? entity.type : undefined;
      const externalId = typeof entity.id === "string" ? entity.id : undefined;
      return domain && apsType && externalId
        ? [{ domain, apsType, externalId, entityType: relationshipEntityType(domain) }]
        : [];
    });
    if (endpoints.length < 2) return [];
    return [{ id: typeof raw.id === "string" ? raw.id : `relationship-${index}`, endpoints }];
  });
  return { relationships, total: relationships.length };
}
