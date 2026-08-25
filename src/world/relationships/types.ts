import type { WorldEntityType } from "../entities";

export type RelationshipFeedState = "available" | "empty" | "permission_denied" | "unsupported" | "error";

export interface RelationshipEndpoint {
  domain: string;
  apsType: string;
  externalId: string;
  entityType?: WorldEntityType;
}

export interface ApsWorldRelationship {
  id: string;
  endpoints: RelationshipEndpoint[];
}

export interface RelationshipFeed {
  state: RelationshipFeedState;
  relationships: ApsWorldRelationship[];
  total: number;
  error?: string;
  httpStatus?: number;
}

export interface ResolvedRelationship {
  id: string;
  type: "aps-relationship" | "issue-assignee";
  sourceEntityId: string;
  targetEntityId: string;
  label: string;
}
