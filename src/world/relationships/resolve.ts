import type { WorldEntity, WorldEntityType } from "../entities";
import type { ApsWorldRelationship, ResolvedRelationship } from "./types";

function rawRecord(entity: WorldEntity): Record<string, unknown> {
  return entity.metadata.raw && typeof entity.metadata.raw === "object"
    ? entity.metadata.raw as Record<string, unknown>
    : {};
}

function aliases(entity: WorldEntity): string[] {
  const raw = rawRecord(entity);
  return [entity.externalId, raw.id, raw.autodeskId]
    .filter((value): value is string => typeof value === "string" && Boolean(value));
}

function entityIndex(entities: WorldEntity[]) {
  const index = new Map<string, WorldEntity>();
  for (const entity of entities) {
    for (const alias of aliases(entity)) index.set(`${entity.type}:${alias}`, entity);
  }
  return index;
}

function pairKey(a: string, b: string, relationshipId: string) {
  return [a, b].sort().join("|") + `|${relationshipId}`;
}

export function resolveWorldRelationships(
  relationships: ApsWorldRelationship[],
  entities: WorldEntity[],
): ResolvedRelationship[] {
  const index = entityIndex(entities);
  const resolved: ResolvedRelationship[] = [];
  const seen = new Set<string>();

  for (const relationship of relationships) {
    const matched = relationship.endpoints
      .map((endpoint) => endpoint.entityType
        ? index.get(`${endpoint.entityType}:${endpoint.externalId}`)
        : undefined)
      .filter((entity): entity is WorldEntity => Boolean(entity));
    for (let first = 0; first < matched.length; first += 1) {
      for (let second = first + 1; second < matched.length; second += 1) {
        if (matched[first].id === matched[second].id) continue;
        const key = pairKey(matched[first].id, matched[second].id, relationship.id);
        if (seen.has(key)) continue;
        seen.add(key);
        resolved.push({
          id: key,
          type: "aps-relationship",
          sourceEntityId: matched[first].id,
          targetEntityId: matched[second].id,
          label: "APS relationship",
        });
      }
    }
  }

  const people = entities.filter((entity) => entity.type === "person");
  const peopleByAlias = entityIndex(people);
  for (const issue of entities.filter((entity) => entity.type === "issue")) {
    const assignedTo = rawRecord(issue).assignedTo;
    if (typeof assignedTo !== "string" || !assignedTo) continue;
    const person = peopleByAlias.get(`person:${assignedTo}`);
    if (!person) continue;
    const id = `assignment:${issue.id}:${person.id}`;
    resolved.push({
      id,
      type: "issue-assignee",
      sourceEntityId: issue.id,
      targetEntityId: person.id,
      label: "Assigned to",
    });
  }
  return resolved;
}

export function relatedEntities(
  selectedEntityId: string | undefined,
  relationships: ResolvedRelationship[],
  entities: WorldEntity[],
): Array<{ entity: WorldEntity; relationship: ResolvedRelationship }> {
  if (!selectedEntityId) return [];
  const entitiesById = new Map(entities.map((entity) => [entity.id, entity]));
  return relationships.flatMap((relationship) => {
    const relatedId = relationship.sourceEntityId === selectedEntityId
      ? relationship.targetEntityId
      : relationship.targetEntityId === selectedEntityId
        ? relationship.sourceEntityId
        : undefined;
    const entity = relatedId ? entitiesById.get(relatedId) : undefined;
    return entity ? [{ entity, relationship }] : [];
  });
}

export function relationshipEntityType(domain: string): WorldEntityType | undefined {
  const normalized = domain.toLowerCase();
  if (normalized === "autodesk-bim360-issue" || normalized === "autodesk-bim360-issues") return "issue";
  if (normalized === "autodesk-bim360-asset") return "asset";
  if (normalized === "autodesk-bim360-documentmanagement") return "document";
  if (normalized === "autodesk-bim360-checklist") return "form";
  if (normalized === "autodesk-bim360-rfi" || normalized === "autodesk-bim360-rfis") return "rfi";
  return undefined;
}
