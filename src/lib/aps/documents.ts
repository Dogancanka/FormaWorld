import "server-only";

import { getValidAccessToken, requestApsJson } from "./client";
import type { SelectedProject } from "../session";
import type { ApsCollection, ApsResource } from "./types";
import { adaptApsDocument } from "@/world/adapters";
import type { ApsRecord, WorldEntity } from "@/world/entities";

type DocumentAttributes = Record<string, unknown> & { displayName?: string; name?: string };
type DocumentResource = ApsResource<DocumentAttributes>;
const DOCUMENT_LIMIT = 25;

export async function listWorldDocuments(project: SelectedProject): Promise<{
  entities: WorldEntity[];
  total: number;
  limit: number;
  scope: string;
}> {
  const token = await getValidAccessToken();
  const topFolders = await requestApsJson<ApsCollection<DocumentResource>>(
    `/project/v1/hubs/${encodeURIComponent(project.hubId)}/projects/${encodeURIComponent(project.id)}/topFolders`,
    token,
  );
  const firstFolder = topFolders.data[0];
  let firstFolderContents: DocumentResource[] = [];
  if (firstFolder) {
    const contents = await requestApsJson<ApsCollection<DocumentResource>>(
      `/data/v1/projects/${encodeURIComponent(project.id)}/folders/${encodeURIComponent(firstFolder.id)}/contents?page[limit]=20`,
      token,
    );
    firstFolderContents = contents.data;
  }
  const selectedResources = [...topFolders.data, ...firstFolderContents].slice(0, DOCUMENT_LIMIT);
  const entities = selectedResources.map((resource): WorldEntity => {
    const raw = resource as unknown as ApsRecord;
    const entity = adaptApsDocument(raw, { projectId: project.id });
    return {
      ...entity,
      zone: "documents",
      metadata: {
        ...entity.metadata,
        resourceType: resource.type,
        isFolder: resource.type === "folders",
      },
    };
  });
  return {
    entities,
    total: entities.length,
    limit: DOCUMENT_LIMIT,
    scope: "Top-level folders and up to 20 items from the first accessible folder",
  };
}
