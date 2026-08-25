import type { ZoneId } from "../zones";

export type WorldEntityType = "asset" | "issue" | "rfi" | "document" | "form" | "person";

export interface WorldRelationship {
  type: string;
  targetId: string;
}

export interface WorldEntity {
  id: string;
  externalId: string;
  type: WorldEntityType;
  title: string;
  status?: string;
  source: "aps";
  projectId: string;
  zone?: ZoneId;
  position?: [number, number, number];
  relationships?: WorldRelationship[];
  metadata: Record<string, unknown>;
}

export interface AdapterContext {
  projectId: string;
}

export type ApsRecord = Record<string, unknown>;
