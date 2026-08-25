import { NextResponse } from "next/server";
import { ApsApiError } from "@/lib/aps/client";
import { listWorldAssets } from "@/lib/aps/assets";
import { listWorldDocuments } from "@/lib/aps/documents";
import { listWorldForms } from "@/lib/aps/forms";
import { listWorldIssues } from "@/lib/aps/issues";
import { listWorldPeople } from "@/lib/aps/people";
import { listWorldRelationships } from "@/lib/aps/relationships";
import { listWorldRfis } from "@/lib/aps/rfis";
import { getSession, resolveWorldProject, type SelectedProject } from "@/lib/session";
import type { AssetFeed } from "@/world/assets/types";
import type { DocumentFeed } from "@/world/documents/types";
import type { FormFeed } from "@/world/forms/types";
import type { IssueFeed } from "@/world/issues/types";
import type { PeopleFeed } from "@/world/people/types";
import type { RelationshipFeed } from "@/world/relationships/types";
import type { RfiFeed } from "@/world/rfis/types";

/**
 * Every domain of one compound in a single response.
 *
 * The world used to ask for seven feeds separately. That was fine for one
 * project and became the slowest thing in the app the moment a world could hold
 * six: 42 requests against a browser that opens about six connections per
 * origin, so the compounds arrived in waves and the world took tens of seconds
 * to finish building. One request per compound turns those waves into six
 * parallel reads, and the server was already fetching the seven in parallel
 * anyway.
 *
 * The per-domain routes stay. They are what a write reconciles through, where
 * refetching one feed is exactly the point.
 *
 * Each domain keeps its own state and its own error. A project missing the RFI
 * module must not cost the reader its assets, so a failure is reported in that
 * domain's slot rather than failing the response.
 */

function failureState(status: number): "permission_denied" | "unsupported" | "error" {
  if (status === 403) return "permission_denied";
  if ([404, 405, 501].includes(status)) return "unsupported";
  return "error";
}

/** Read one domain, turning any failure into that domain's honest empty state. */
async function read<T extends { state: string }>(
  load: () => Promise<Omit<T, "state">>,
  onFailure: (status: number, message: string) => T,
): Promise<T> {
  try {
    const result = await load();
    const total = (result as { total?: number }).total ?? 0;
    return { ...result, state: total > 0 ? "available" : "empty" } as T;
  } catch (cause) {
    const status = cause instanceof ApsApiError ? cause.status : 500;
    return onFailure(status, cause instanceof Error ? cause.message : "APS did not answer.");
  }
}

export interface WorldSnapshotResponse {
  projectId: string;
  assets: AssetFeed;
  issues: IssueFeed;
  people: PeopleFeed;
  documents: DocumentFeed;
  forms: FormFeed;
  rfis: RfiFeed;
  relationships: RelationshipFeed;
}

async function readProject(project: SelectedProject): Promise<WorldSnapshotResponse> {
  const [assets, issues, people, documents, forms, rfis, relationships] = await Promise.all([
    read<AssetFeed>(() => listWorldAssets(project), (status, error) => ({
      state: failureState(status), entities: [], total: 0, limit: 25,
      statuses: [], categories: [], httpStatus: status, error,
    })),
    read<IssueFeed>(() => listWorldIssues(project), (status, error) => ({
      state: failureState(status), entities: [], total: 0, limit: 50, httpStatus: status, error,
    })),
    read<PeopleFeed>(() => listWorldPeople(project), (status, error) => ({
      state: failureState(status), entities: [], total: 0, limit: 100, httpStatus: status, error,
    })),
    read<DocumentFeed>(() => listWorldDocuments(project), (status, error) => ({
      state: failureState(status), entities: [], total: 0, limit: 25,
      scope: "Top-level folders and the first accessible folder", httpStatus: status, error,
    })),
    read<FormFeed>(() => listWorldForms(project), (status, error) => ({
      state: failureState(status), entities: [], total: 0, limit: 25, httpStatus: status, error,
    })),
    read<RfiFeed>(() => listWorldRfis(project), (status, error) => ({
      state: failureState(status), entities: [], total: 0, limit: 50, httpStatus: status, error,
    })),
    read<RelationshipFeed>(() => listWorldRelationships(project), (status, error) => ({
      state: failureState(status), relationships: [], total: 0, httpStatus: status, error,
    })),
  ]);
  return { projectId: project.id, assets, issues, people, documents, forms, rfis, relationships };
}

export async function GET(request: Request) {
  const session = await getSession();
  const project = resolveWorldProject(session, new URL(request.url).searchParams.get("projectId"));
  if (!project) {
    return NextResponse.json({ error: "Select a project first." }, { status: 409 });
  }
  const snapshot = await readProject(project);
  console.info(
    `World snapshot for ${project.name}: `
    + [
      `assets=${snapshot.assets.state}`,
      `issues=${snapshot.issues.state}`,
      `people=${snapshot.people.state}`,
      `documents=${snapshot.documents.state}`,
      `forms=${snapshot.forms.state}`,
      `rfis=${snapshot.rfis.state}`,
      `relationships=${snapshot.relationships.state}`,
    ].join(" "),
  );
  return NextResponse.json(snapshot);
}
