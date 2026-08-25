import "server-only";

import { getValidAccessToken, requestApsJson } from "./client";
import { projectUuid } from "./project-id";
import type { SelectedProject } from "../session";
import { adaptApsPerson } from "@/world/adapters";
import type { ApsRecord, WorldEntity } from "@/world/entities";

type JsonObject = Record<string, unknown>;
const PEOPLE_LIMIT = 100;

function records(value: unknown): ApsRecord[] {
  return Array.isArray(value)
    ? value.filter((item): item is ApsRecord => Boolean(item && typeof item === "object"))
    : [];
}

export async function listWorldPeople(project: SelectedProject): Promise<{
  entities: WorldEntity[];
  total: number;
  limit: number;
}> {
  const token = await getValidAccessToken();
  const id = encodeURIComponent(projectUuid(project.id));
  const payload = await requestApsJson<JsonObject>(
    `/construction/admin/v1/projects/${id}/users?limit=${PEOPLE_LIMIT}&offset=0`,
    token,
  );
  const rawPeople = records(payload.results);
  const entities = rawPeople.map((raw): WorldEntity => {
    const entity = adaptApsPerson(raw, { projectId: project.id });
    return {
      ...entity,
      zone: "people",
      metadata: {
        ...entity.metadata,
        companyName: typeof raw.companyName === "string"
          ? raw.companyName
          : raw.company && typeof raw.company === "object" && typeof (raw.company as JsonObject).name === "string"
            ? (raw.company as JsonObject).name
            : undefined,
      },
    };
  });
  const pagination = payload.pagination && typeof payload.pagination === "object"
    ? payload.pagination as JsonObject
    : {};
  const total = typeof pagination.totalResults === "number" ? pagination.totalResults : rawPeople.length;
  return { entities, total, limit: PEOPLE_LIMIT };
}
