import "server-only";

import { ApsApiError, getValidAccessToken, requestApsJson } from "./client";
import { projectUuid } from "./project-id";
import { apsCollection, apsTotal, describeCollection } from "./collection";
import type { SelectedProject } from "../session";
import { adaptApsRfi } from "@/world/adapters";
import type { WorldEntity } from "@/world/entities";

const RFI_LIMIT = 50;

// The ACC RFI service is addressed by the project's container UUID. Some
// tenants answer on the `containers` form of the route and some on `projects`,
// so both documented forms are attempted before the district is reported as
// unsupported. Whichever answers is logged, and a real 401/403 is never
// swallowed as "not supported".
const RFI_ROUTES = [
  (id: string) => `/construction/rfis/v2/containers/${id}/rfis?limit=${RFI_LIMIT}&offset=0`,
  (id: string) => `/construction/rfis/v2/projects/${id}/rfis?limit=${RFI_LIMIT}&offset=0`,
];

export async function listWorldRfis(project: SelectedProject): Promise<{
  entities: WorldEntity[];
  total: number;
  limit: number;
}> {
  const token = await getValidAccessToken();
  const id = encodeURIComponent(projectUuid(project.id));

  let lastError: unknown;
  for (const route of RFI_ROUTES) {
    const path = route(id);
    try {
      const payload = await requestApsJson<unknown>(path, token);
      const collection = apsCollection(payload, "results", "data", "rfis");
      const total = apsTotal(payload, collection.records.length);
      console.info(describeCollection(`APS RFIs page (${path.split("?")[0]})`, collection, total));
      const entities = collection.records.map((raw): WorldEntity => ({
        ...adaptApsRfi(raw, { projectId: project.id }),
        zone: "rfis",
      }));
      return { entities, total, limit: RFI_LIMIT };
    } catch (cause) {
      lastError = cause;
      // Only a "this route does not exist here" answer is worth retrying on the
      // other documented form. Permission and auth failures are real answers.
      const status = cause instanceof ApsApiError ? cause.status : 0;
      if (![404, 405, 501].includes(status)) throw cause;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new ApsApiError("RFIs are not available for this project.", 404);
}
