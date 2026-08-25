"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import Link from "next/link";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, Line, MapControls } from "@react-three/drei";
import { ASSET_ZONE, worldZones, type AssetStatusOption, type WorldZone, type ZoneId, type ZoneKind } from "@/world/zones";
import { zonePositions, type ZonePositions } from "@/world/layout";
import type { AssetFeed } from "@/world/assets/types";
import type { WorldEntity } from "@/world/entities";
import type { IssueFeed } from "@/world/issues/types";
import type { PeopleFeed } from "@/world/people/types";
import { layoutAssetYard, type AssetYardPlan } from "@/world/assets/layout";
import { assetAppearance, type AssetAppearance, type AssetCategoryOption, type AssetForm } from "@/world/assets/materials";
import { layoutPeople } from "@/world/people/layout";
import { personAppearance } from "@/world/people/identity";
import type { DocumentFeed } from "@/world/documents/types";
import type { FormFeed } from "@/world/forms/types";
import type { RfiFeed } from "@/world/rfis/types";
import type { RelationshipFeed, ResolvedRelationship } from "@/world/relationships/types";
import { relatedEntities, resolveWorldRelationships } from "@/world/relationships/resolve";
import { issueStateColor, type IssueVisualState } from "@/world/rules/issue-state";
import { issueMarkerOffsets, layoutIssueBays, type IssueBay } from "@/world/issues/layout";
import type { CreateIssueInput, CreateIssueResult, IssueCreateOptions } from "@/world/issues/write-types";
import { detectIssueActivity, personMatchesActor, type IssueActivityEvent } from "@/world/activity/issue-activity";
import type { ExecuteWorldActionInput, ExecuteWorldActionResult, WorldActionCapability, WorldActionOptions } from "@/world/actions/types";
import { shouldRefreshOnVisibilityChange, syncIntervalForVisibility, type WorldSyncTrigger } from "@/world/sync/policy";
import { segmentIntersectsZone, type PositionedZone } from "@/world/spatial";
import {
  mergeEntityFeeds,
  placeCompounds,
  type CompoundPlacement,
  type WorldProjectRef,
} from "@/world/multi-project";
import {
  compoundBounds,
  compoundGates,
  districtPaths,
  pointClearOfPaths,
  type CompoundBounds,
  type GroundPath,
} from "@/world/compound";
import { CompoundWall, DirtPaths, GroundPlane, WaterBodies } from "./compound-shell";
import { EntityIcon } from "./entity-icon";
import { SmokePlume } from "./smoke";
import { DueDateHealthBar, OverdueSmoke } from "./due-date-health-bar";
import { AwayLog, XpMeter } from "./progression-hud";
import { WorldActionBar } from "./world-actionbar";
import { awayEvents, type AwayEvent } from "@/world/progression/away-log";
import { buildSnapshot } from "@/world/progression/snapshot";
import { saveVisitSnapshot, useProgression } from "@/world/progression/store";
import { groupDistrictEntities, isUngrouped } from "@/world/entities/grouping";
import { openWater, pointClearOfWater, waterBodies, type CompoundRect, type WaterBody } from "@/world/water";
import { brickTexture, dirtTexture, grassTexture, shingleTexture } from "@/world/visual/textures";
import { MathUtils, MeshBasicMaterial, Vector3, type Group, type Mesh } from "three";
import type { MapControls as MapControlsImpl } from "three-stdlib";

/**
 * `fit` asks the camera to frame a footprint of this width and depth rather
 * than to hit a fixed zoom. Only the render loop knows the viewport, so the
 * number is worked out there instead of by the caller.
 */
type FocusRequest = {
  zoneId: ZoneId;
  serial: number;
  /** Which compound the zone belongs to; the primary one when absent. */
  projectId?: string;
  target?: [number, number];
  zoom?: number;
  fit?: [number, number];
};
type SyncState = "idle" | "syncing" | "current" | "partial_error";

// Shapes the merge falls back to. A merged feed only ever borrows the fields a
// domain does not aggregate, so these are never shown as data.
const EMPTY_ASSET_FEED: AssetFeed = { state: "empty", entities: [], total: 0, limit: 25, statuses: [], categories: [] };
const EMPTY_ISSUE_FEED: IssueFeed = { state: "empty", entities: [], total: 0, limit: 50 };
const EMPTY_PEOPLE_FEED: PeopleFeed = { state: "empty", entities: [], total: 0, limit: 50 };
const EMPTY_DOCUMENT_FEED: DocumentFeed = { state: "empty", entities: [], total: 0, limit: 50, scope: "Top-level folders and the first accessible folder" };
const EMPTY_FORM_FEED: FormFeed = { state: "empty", entities: [], total: 0, limit: 25 };
const EMPTY_RFI_FEED: RfiFeed = { state: "empty", entities: [], total: 0, limit: 50 };

/**
 * A world can hold several compounds, so every read names its project. The
 * server falls back to the primary project when the parameter is absent, which
 * is what keeps a one-project world working unchanged.
 */
function feedUrl(path: string, projectId?: string): string {
  return projectId ? `${path}?projectId=${encodeURIComponent(projectId)}` : path;
}

async function fetchAssetFeed(projectId?: string): Promise<AssetFeed> {
  const response = await fetch(feedUrl("/api/world/assets", projectId), { cache: "no-store", headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Asset request failed with HTTP ${response.status}.`);
  return response.json() as Promise<AssetFeed>;
}

async function fetchIssueFeed(projectId?: string): Promise<IssueFeed> {
  const response = await fetch(feedUrl("/api/world/issues", projectId), { cache: "no-store", headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Issue request failed with HTTP ${response.status}.`);
  return response.json() as Promise<IssueFeed>;
}

async function fetchPeopleFeed(projectId?: string): Promise<PeopleFeed> {
  const response = await fetch(feedUrl("/api/world/people", projectId), { cache: "no-store", headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`People request failed with HTTP ${response.status}.`);
  return response.json() as Promise<PeopleFeed>;
}

async function fetchDocumentFeed(projectId?: string): Promise<DocumentFeed> {
  const response = await fetch(feedUrl("/api/world/documents", projectId), { cache: "no-store", headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Document request failed with HTTP ${response.status}.`);
  return response.json() as Promise<DocumentFeed>;
}

async function fetchRfiFeed(projectId?: string): Promise<RfiFeed> {
  const response = await fetch(feedUrl("/api/world/rfis", projectId), { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error ?? `RFIs failed with HTTP ${response.status}.`);
  return payload as RfiFeed;
}

async function fetchFormFeed(projectId?: string): Promise<FormFeed> {
  const response = await fetch(feedUrl("/api/world/forms", projectId), { cache: "no-store", headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Forms request failed with HTTP ${response.status}.`);
  return response.json() as Promise<FormFeed>;
}

async function fetchRelationshipFeed(projectId?: string): Promise<RelationshipFeed> {
  const response = await fetch(feedUrl("/api/world/relationships", projectId), { cache: "no-store", headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Relationship request failed with HTTP ${response.status}.`);
  return response.json() as Promise<RelationshipFeed>;
}

async function fetchIssueCreateOptions(projectId?: string): Promise<IssueCreateOptions> {
  const response = await fetch(feedUrl("/api/world/issue-options", projectId), { cache: "no-store", headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Issue options request failed with HTTP ${response.status}.`);
  return response.json() as Promise<IssueCreateOptions>;
}

async function postIssue(input: CreateIssueInput, projectId?: string): Promise<CreateIssueResult> {
  const response = await fetch("/api/world/issues", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    // The issue is created in the compound the composer was opened from, which
    // in a multi-project world is not necessarily the primary project.
    body: JSON.stringify({ ...input, projectId }),
  });
  const payload = await response.json().catch(() => ({})) as CreateIssueResult & { error?: string; requiresReauthentication?: boolean };
  if (!response.ok) {
    const error = new Error(payload.error ?? `Issue creation failed with HTTP ${response.status}.`);
    Object.assign(error, { requiresReauthentication: payload.requiresReauthentication });
    throw error;
  }
  return payload;
}

async function fetchWorldActionOptions(entity: WorldEntity): Promise<WorldActionOptions> {
  const query = new URLSearchParams({ entityType: entity.type, entityId: entity.externalId });
  if (entity.projectId) query.set("projectId", entity.projectId);
  const response = await fetch(`/api/world/actions?${query}`, { cache: "no-store", headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`World actions request failed with HTTP ${response.status}.`);
  return response.json() as Promise<WorldActionOptions>;
}

async function executeWorldAction(
  input: ExecuteWorldActionInput,
  projectId?: string,
): Promise<ExecuteWorldActionResult> {
  const response = await fetch("/api/world/actions", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    // The record being changed belongs to one compound; the mutation follows it.
    body: JSON.stringify({ ...input, projectId }),
  });
  const payload = await response.json().catch(() => ({})) as ExecuteWorldActionResult & { error?: string; requiresReauthentication?: boolean };
  if (!response.ok) {
    const error = new Error(payload.error ?? `World action failed with HTTP ${response.status}.`);
    Object.assign(error, { requiresReauthentication: payload.requiresReauthentication });
    throw error;
  }
  return payload;
}

/** A compound after layout: its feeds, its districts and where it stands. */
interface CompoundView {
  entry: ProjectFeeds;
  zones: WorldZone[];
  positions: ZonePositions;
  bounds: CompoundBounds;
  offset: [number, number];
}

/** Everything one compound has read from APS. */
interface ProjectFeeds {
  project: WorldProjectRef;
  assets?: AssetFeed;
  issues?: IssueFeed;
  people?: PeopleFeed;
  documents?: DocumentFeed;
  forms?: FormFeed;
  rfis?: RfiFeed;
  relationships?: RelationshipFeed;
}

export default function WorldCanvas({ projects }: { projects: WorldProjectRef[] }) {
  // The project a write is created against and the one saved progress is keyed
  // to. The others are read-only company in the same world.
  const primary = projects[0];
  const projectName = primary?.name ?? "";
  const projectId = primary?.id ?? "";
  const [selectedId, setSelectedId] = useState<ZoneId | null>("hub");
  // A district exists in every compound, so a selection has to name the project
  // as well. Without it, double-clicking a district on the third compound flew
  // the camera to the first compound's copy of the same district.
  const [selectedProjectId, setSelectedProjectId] = useState<string>();
  /** Set when a whole compound is selected rather than one of its districts. */
  const [selectedCompoundId, setSelectedCompoundId] = useState<string>();
  const [panelOpen, setPanelOpen] = useState(false);
  // Feeds are held per project, because districts are laid out from a project's
  // own APS asset statuses and each compound has its own wall. Everything that
  // talks about "the world" — the HUD, the inspector, the digest, the
  // statistics — reads the merged views below instead, so it keeps working over
  // however many projects the reader picked.
  const [byProject, setByProject] = useState<ProjectFeeds[]>(
    () => projects.map((project) => ({ project })),
  );
  const assetFeed = useMemo(
    () => mergeEntityFeeds(byProject.map((entry) => entry.assets), EMPTY_ASSET_FEED),
    [byProject],
  );
  const issueFeed = useMemo(
    () => mergeEntityFeeds(byProject.map((entry) => entry.issues), EMPTY_ISSUE_FEED),
    [byProject],
  );
  const peopleFeed = useMemo(
    () => mergeEntityFeeds(byProject.map((entry) => entry.people), EMPTY_PEOPLE_FEED),
    [byProject],
  );
  const documentFeed = useMemo(
    () => mergeEntityFeeds(byProject.map((entry) => entry.documents), EMPTY_DOCUMENT_FEED),
    [byProject],
  );
  const formFeed = useMemo(
    () => mergeEntityFeeds(byProject.map((entry) => entry.forms), EMPTY_FORM_FEED),
    [byProject],
  );
  const rfiFeed = useMemo(
    () => mergeEntityFeeds(byProject.map((entry) => entry.rfis), EMPTY_RFI_FEED),
    [byProject],
  );
  const relationshipFeed = useMemo(() => {
    const present = byProject.map((entry) => entry.relationships).filter(Boolean) as RelationshipFeed[];
    if (present.length === 0) return undefined;
    if (present.length === 1) return present[0];
    const failed = present.find((entry) => entry.error);
    return {
      state: present.some((entry) => entry.state === "available") ? "available" as const : present[0].state,
      relationships: present.flatMap((entry) => entry.relationships),
      total: present.reduce((sum, entry) => sum + entry.total, 0),
      error: failed?.error,
      httpStatus: failed?.httpStatus,
    };
  }, [byProject]);
  const [focusRequest, setFocusRequest] = useState<FocusRequest>();
  const [selectedEntityId, setSelectedEntityId] = useState<string>();
  const [relationshipFocusEntityId, setRelationshipFocusEntityId] = useState<string>();
  // An empty object opens the composer with no record behind it, which is what
  // the global tool bar does; `undefined` keeps it closed.
  const [issueComposer, setIssueComposer] = useState<{ context?: WorldEntity }>();
  const [awayLogOpen, setAwayLogOpen] = useState(true);
  // The digest line the reader asked to see: its records get a ring in the world
  // and the inspector narrows to exactly them.
  const [revealed, setRevealed] = useState<AwayEvent>();
  const [activityEvents, setActivityEvents] = useState<IssueActivityEvent[]>([]);
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [lastSyncedAt, setLastSyncedAt] = useState<number>();
  const [statsOpen, setStatsOpen] = useState(false);
  const [navMenuOpen, setNavMenuOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  // Issue activity is diffed per project: one compound's records must never be
  // compared against another's.
  const issueSnapshotRef = useRef<Map<string, WorldEntity[]>>(new Map());
  // The reconciliation loop reads the project list through a ref so a re-render
  // never rebuilds the interval that drives it.
  const projectsRef = useRef(projects);
  const syncInFlightRef = useRef<Promise<void> | null>(null);
  const activityAutoCloseRef = useRef<number | undefined>(undefined);
  const mountedRef = useRef(true);
  const controlsRef = useRef<MapControlsImpl>(null);
  const allEntities = useMemo(() => [
    ...(assetFeed?.entities ?? []),
    ...(issueFeed?.entities ?? []),
    ...(peopleFeed?.entities ?? []),
    ...(documentFeed?.entities ?? []),
    ...(formFeed?.entities ?? []),
    ...(rfiFeed?.entities ?? []),
  ], [assetFeed, issueFeed, peopleFeed, documentFeed, formFeed, rfiFeed]);
  const resolvedRelationships = useMemo(
    () => resolveWorldRelationships(relationshipFeed?.relationships ?? [], allEntities),
    [relationshipFeed, allEntities],
  );
  const selectedRelationships = useMemo(
    () => relatedEntities(selectedEntityId, resolvedRelationships, allEntities),
    [selectedEntityId, resolvedRelationships, allEntities],
  );
  const selectedEntity = allEntities
    .find((entity) => entity.id === selectedEntityId);
  // One asset district holds the whole workflow: the project's own APS statuses
  // become lanes inside it, so a status change moves an asset along the yard
  // rather than to another district. The yard's footprint follows its lanes.
  const assetEntities = useMemo(() => assetFeed?.entities ?? [], [assetFeed]);
  const assetCategories = useMemo(() => assetFeed?.categories ?? [], [assetFeed]);
  const assetYard = useMemo(() => layoutAssetYard(
    assetFeed?.statuses ?? [],
    assetEntities,
    (entity) => assetStatusIdOf(entity),
    (entity) => assetLook(entity, assetCategories).key,
  ), [assetFeed, assetEntities, assetCategories]);
  const zones = useMemo(() => worldZones(assetYard.size), [assetYard]);
  const renderPositions = useMemo(() => zonePositions(zones), [zones]);

  /**
   * One walled compound per project, side by side on open ground.
   *
   * Districts are laid out from a project's own APS asset statuses, so each
   * compound is measured on its own and only then placed: a project with a
   * twelve-status workflow gets a wider yard than one with three, and the
   * placement leaves room for it instead of overlapping its neighbour.
   */
  const compounds = useMemo(() => {
    const built = byProject.map((entry) => {
      const entities = entry.assets?.entities ?? [];
      const categories = entry.assets?.categories ?? [];
      const yard = layoutAssetYard(
        entry.assets?.statuses ?? [],
        entities,
        (entity) => assetStatusIdOf(entity),
        (entity) => assetLook(entity, categories).key,
      );
      const compoundZones = worldZones(yard.size);
      const positions = zonePositions(compoundZones);
      const bounds = compoundBounds(compoundZones, positions);
      return { entry, yard, categories, zones: compoundZones, positions, bounds };
    });
    const placements = placeCompounds(built.map((compound) => ({
      projectId: compound.entry.project.id,
      halfWidth: (compound.bounds.maxX - compound.bounds.minX) / 2 + 1,
      halfDepth: (compound.bounds.maxZ - compound.bounds.minZ) / 2 + 1,
    })));
    const offsets = new Map<string, CompoundPlacement["offset"]>(
      placements.map((placement) => [placement.projectId, placement.offset]),
    );
    return built.map((compound) => {
      const [placedX, placedZ] = offsets.get(compound.entry.project.id) ?? [0, 0];
      // Compounds are measured around their own origin, which is not exactly
      // their centre, so the group is shifted by the difference to land the
      // compound's middle on the placement point.
      const offset: [number, number] = [
        placedX - (compound.bounds.minX + compound.bounds.maxX) / 2,
        placedZ - (compound.bounds.minZ + compound.bounds.maxZ) / 2,
      ];
      return { ...compound, offset };
    });
  }, [byProject]);

  /** Where a district actually is in world space, compound offset included. */
  const zoneWorldTarget = useCallback((zoneId: ZoneId, ownerId?: string): [number, number] => {
    const compound = compounds.find((candidate) => candidate.entry.project.id === ownerId) ?? compounds[0];
    const position = compound?.positions[zoneId] ?? renderPositions[zoneId];
    if (!position) return [0, 0];
    return [position[0] + (compound?.offset[0] ?? 0), position[2] + (compound?.offset[1] ?? 0)];
  }, [compounds, renderPositions]);
  const selectedZone = zones.find((zone) => zone.id === selectedId);
  const selectedCompound = compounds.find(
    (compound) => compound.entry.project.id === selectedCompoundId,
  );
  const selectedZoneEntities = useMemo(() => {
    // Narrowed to the compound that was clicked. Without this, opening the
    // issues district on one project listed every project's issues.
    const scoped = selectedProjectId
      ? allEntities.filter((entity) => entity.projectId === selectedProjectId)
      : allEntities;
    if (!selectedId || selectedId === "hub") return scoped;
    const kind = zones.find((zone) => zone.id === selectedId)?.kind;
    return scoped.filter((entity) => {
      if (kind === "assets") return entity.type === "asset" && entity.zone === selectedId;
      if (kind === "issues") return entity.type === "issue";
      if (kind === "rfis") return entity.type === "rfi";
      if (kind === "people") return entity.type === "person";
      if (kind === "documents") return entity.type === "document";
      if (kind === "forms") return entity.type === "form";
      return false;
    });
  }, [allEntities, selectedId, selectedProjectId, zones]);
  const selectedZoneKind = zones.find((zone) => zone.id === selectedId)?.kind;
  /** The feeds the district panel counts against: one compound's, or the world's. */
  const scopedFeeds = useMemo(() => {
    const owner = selectedProjectId
      ? byProject.find((entry) => entry.project.id === selectedProjectId)
      : undefined;
    return owner ?? {
      assets: assetFeed, issues: issueFeed, rfis: rfiFeed,
      people: peopleFeed, documents: documentFeed, forms: formFeed,
    };
  }, [assetFeed, byProject, documentFeed, formFeed, issueFeed, peopleFeed, rfiFeed, selectedProjectId]);
  const selectedZoneTotal = selectedId === "hub"
    ? [scopedFeeds.assets?.total, scopedFeeds.issues?.total, scopedFeeds.rfis?.total, scopedFeeds.people?.total, scopedFeeds.documents?.total, scopedFeeds.forms?.total].reduce<number>((sum, total) => sum + (total ?? 0), 0)
    : selectedZoneKind === "issues" ? scopedFeeds.issues?.total ?? selectedZoneEntities.length
      : selectedZoneKind === "rfis" ? scopedFeeds.rfis?.total ?? selectedZoneEntities.length
        : selectedZoneKind === "people" ? scopedFeeds.people?.total ?? selectedZoneEntities.length
          : selectedZoneKind === "documents" ? scopedFeeds.documents?.total ?? selectedZoneEntities.length
            : selectedZoneKind === "forms" ? scopedFeeds.forms?.total ?? selectedZoneEntities.length
              : selectedZoneEntities.length;
  const worldTotal = [assetFeed?.total, issueFeed?.total, rfiFeed?.total, peopleFeed?.total, documentFeed?.total, formFeed?.total]
    .reduce<number>((sum, total) => sum + (total ?? 0), 0);
  const worldFeedsPending = ![assetFeed, issueFeed, rfiFeed, peopleFeed, documentFeed, formFeed, relationshipFeed].every(Boolean);
  const workerActivity = useMemo(() => {
    const result = new Map<string, IssueActivityEvent>();
    for (const person of peopleFeed?.entities ?? []) {
      const activity = activityEvents.find((event) => personMatchesActor(person, event.workerExternalId ?? event.actorExternalId));
      if (activity) result.set(person.id, activity);
    }
    return result;
  }, [activityEvents, peopleFeed]);

  // Progress belongs to the reader, not to the project data, so it lives in its
  // own store and survives a reload of the world.
  const progression = useProgression(projectId);
  // Reset view frames the whole world, which with several projects means every
  // compound and the ground between them.
  const worldBounds = useMemo(() => {
    if (compounds.length === 0) return compoundBounds(zones, renderPositions);
    return compounds.reduce((total, compound) => ({
      minX: Math.min(total.minX, compound.bounds.minX + compound.offset[0]),
      maxX: Math.max(total.maxX, compound.bounds.maxX + compound.offset[0]),
      minZ: Math.min(total.minZ, compound.bounds.minZ + compound.offset[1]),
      maxZ: Math.max(total.maxZ, compound.bounds.maxZ + compound.offset[1]),
    }), {
      minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity,
    } as CompoundBounds);
  }, [compounds, renderPositions, zones]);

  /**
   * Reset view frames this rather than `worldBounds` itself. A wall drawn
   * exactly on the edge of the frame reads as a compound running off the
   * screen, so the fit is given a margin of open ground on every side.
   */
  /**
   * Every compound's footprint in world space. Water and meadow scatter are
   * placed against this list, so nothing in the open ground can ever land on a
   * compound — including the one standing next door.
   */
  const compoundRects = useMemo<CompoundRect[]>(() => compounds.map((compound) => ({
    minX: compound.bounds.minX + compound.offset[0],
    maxX: compound.bounds.maxX + compound.offset[0],
    minZ: compound.bounds.minZ + compound.offset[1],
    maxZ: compound.bounds.maxZ + compound.offset[1],
  })), [compounds]);
  const meadowWater = useMemo(() => openWater(compoundRects), [compoundRects]);

  const minZoom = useMemo(
    () => Math.max(4, 12 / Math.sqrt(Math.max(1, compounds.length))),
    [compounds.length],
  );

  const framedBounds = useMemo<CompoundBounds>(() => ({
    minX: worldBounds.minX - 5,
    maxX: worldBounds.maxX + 5,
    minZ: worldBounds.minZ - 5,
    maxZ: worldBounds.maxZ + 5,
  }), [worldBounds]);

  const resetView = useCallback(() => {
    setFocusRequest({
      zoneId: "hub",
      serial: Date.now(),
      target: [(framedBounds.minX + framedBounds.maxX) / 2, (framedBounds.minZ + framedBounds.maxZ) / 2],
      fit: [framedBounds.maxX - framedBounds.minX, framedBounds.maxZ - framedBounds.minZ],
    });
  }, [framedBounds]);

  // The state the world is in right now, in the shape the next visit will be
  // diffed against. Rebuilt on every reconciliation so the snapshot stored when
  // the reader leaves describes what they actually left behind.
  const currentSnapshot = useMemo(() => worldFeedsPending ? undefined : buildSnapshot({
    issues: issueFeed?.entities ?? [],
    assets: assetEntities,
    rfis: rfiFeed?.entities ?? [],
    forms: formFeed?.entities ?? [],
    people: peopleFeed?.entities ?? [],
  }), [assetEntities, formFeed, issueFeed, peopleFeed, rfiFeed, worldFeedsPending]);

  // Closing the visit. The baseline for the next arrival is written when the
  // page goes away, not on every reconciliation — storing it each sync would
  // leave the reader nothing to be told about, because the world would always
  // match its own last recorded state.
  const snapshotRef = useRef(currentSnapshot);
  useEffect(() => {
    snapshotRef.current = currentSnapshot;
  }, [currentSnapshot]);
  useEffect(() => {
    const save = () => {
      if (snapshotRef.current) saveVisitSnapshot(snapshotRef.current);
    };
    window.addEventListener("pagehide", save);
    return () => {
      window.removeEventListener("pagehide", save);
      save();
    };
  }, []);

  // The digest is derived rather than stored. Its line IDs name the kind of news
  // ("assets changed status"), not the counts inside it, so a sync that moves a
  // number does not resurrect a line the reader has already acknowledged.
  //
  // It waits for `progression.loaded`: computing it before the stored snapshot
  // arrives would show a first-visit digest to a returning reader and then
  // swap it, which reads as the world changing its mind.
  const awayDigest = useMemo(() => worldFeedsPending || !progression.loaded ? [] : awayEvents({
    issues: issueFeed?.entities ?? [],
    assets: assetEntities,
    assetStatuses: assetFeed?.statuses ?? [],
    rfis: rfiFeed?.entities ?? [],
    forms: formFeed?.entities ?? [],
    people: peopleFeed?.entities ?? [],
    previous: progression.previousSnapshot,
    current: currentSnapshot,
  }), [assetEntities, assetFeed, currentSnapshot, formFeed, issueFeed, peopleFeed, progression.loaded, progression.previousSnapshot, rfiFeed, worldFeedsPending]);
  const awayLog = useMemo(
    () => awayDigest.filter((event) => !progression.acknowledged.includes(event.id)),
    [awayDigest, progression.acknowledged],
  );
  const digestIsArrival = awayLog.some((event) => event.firstVisit);

  const revealedIds = useMemo(
    () => revealed ? new Set(revealed.entityIds) : undefined,
    [revealed],
  );

  const revealAway = (event: AwayEvent) => {
    setRevealed((current) => current?.id === event.id ? undefined : event);
    if (revealed?.id === event.id) return;
    setSelectedId(event.zone);
    setSelectedEntityId(undefined);
    setRelationshipFocusEntityId(undefined);
    setPanelOpen(true);
    const owner = allEntities.find((entity) => event.entityIds.includes(entity.id))?.projectId;
    setFocusRequest({
      zoneId: event.zone,
      serial: Date.now(),
      projectId: owner,
      target: zoneWorldTarget(event.zone, owner),
    });
  };

  const acknowledgeAway = (event: AwayEvent) => {
    if (revealed?.id === event.id) setRevealed(undefined);
    progression.acknowledge(event.id, event.xp);
  };

  const peekActivity = () => {
    setActivityOpen(true);
    window.clearTimeout(activityAutoCloseRef.current);
    activityAutoCloseRef.current = window.setTimeout(() => {
      if (mountedRef.current) setActivityOpen(false);
    }, 7000);
  };

  const toggleActivity = () => {
    window.clearTimeout(activityAutoCloseRef.current);
    setActivityOpen((open) => !open);
  };

  const selectZone = (id: ZoneId, ownerId?: string) => {
    setRevealed(undefined);
    setSelectedId(id);
    setSelectedProjectId(ownerId);
    setSelectedCompoundId(undefined);
    setSelectedEntityId(undefined);
    setRelationshipFocusEntityId(undefined);
    setPanelOpen(true);
  };

  const focusZone = (id: ZoneId, ownerId?: string) => {
    selectZone(id, ownerId);
    setFocusRequest({
      zoneId: id,
      serial: Date.now(),
      projectId: ownerId,
      target: zoneWorldTarget(id, ownerId),
    });
  };

  /** Frame one whole compound, the way focusing a district frames a district. */
  const focusCompound = useCallback((ownerId: string) => {
    const compound = compounds.find((candidate) => candidate.entry.project.id === ownerId);
    if (!compound) return;
    setFocusRequest({
      zoneId: "hub",
      serial: Date.now(),
      projectId: ownerId,
      target: [
        (compound.bounds.minX + compound.bounds.maxX) / 2 + compound.offset[0],
        (compound.bounds.minZ + compound.bounds.maxZ) / 2 + compound.offset[1],
      ],
      fit: [
        compound.bounds.maxX - compound.bounds.minX + 6,
        compound.bounds.maxZ - compound.bounds.minZ + 6,
      ],
    });
  }, [compounds]);

  const selectCompound = useCallback((ownerId: string) => {
    setRevealed(undefined);
    setSelectedId(null);
    setSelectedProjectId(ownerId);
    setSelectedCompoundId(ownerId);
    setSelectedEntityId(undefined);
    setRelationshipFocusEntityId(undefined);
    setPanelOpen(true);
  }, []);

  const locateEntity = (entity: WorldEntity) => {
    setSelectedEntityId(entity.id);
    setRelationshipFocusEntityId(undefined);
    const zone = entity.zone ?? `${entity.type}s`;
    setSelectedId(zone);
    setPanelOpen(true);
    // The record belongs to one compound, so the camera flies to that
    // compound's district rather than to the primary project's copy of it.
    setFocusRequest({
      zoneId: zone,
      serial: Date.now(),
      projectId: entity.projectId,
      target: zoneWorldTarget(zone, entity.projectId),
    });
  };

  const locateAllPersonIssues = () => {
    if (!selectedEntity || selectedEntity.type !== "person") return;
    const relatedIssues = selectedRelationships.filter(({ entity }) => entity.type === "issue");
    if (relatedIssues.length === 0) return;
    setRelationshipFocusEntityId(selectedEntity.id);
    const personPosition = renderPositions.people;
    const issuePosition = renderPositions.issues;
    const span = Math.max(Math.abs(personPosition[0] - issuePosition[0]), Math.abs(personPosition[2] - issuePosition[2])) + 8;
    setFocusRequest({
      zoneId: "issues",
      serial: Date.now(),
      target: [(personPosition[0] + issuePosition[0]) / 2, (personPosition[2] + issuePosition[2]) / 2],
      zoom: MathUtils.clamp(390 / span, 16, 48),
    });
  };

  /** Patch one compound's slot, leaving every other project untouched. */
  const updateProject = useCallback((
    id: string,
    update: (entry: ProjectFeeds) => ProjectFeeds,
  ) => {
    setByProject((current) => current.map((entry) => entry.project.id === id ? update(entry) : entry));
  }, []);

  const reconcileCreatedIssue = async (created: WorldEntity) => {
    const owner = created.projectId || projectId;
    issueSnapshotRef.current.set(owner, [
      created,
      ...(issueSnapshotRef.current.get(owner) ?? []).filter((entity) => entity.id !== created.id),
    ]);
    updateProject(owner, (entry) => {
      const current = entry.issues;
      const withoutCreated = (current?.entities ?? []).filter((entity) => entity.id !== created.id);
      return {
        ...entry,
        issues: {
          state: "available",
          entities: [created, ...withoutCreated].slice(0, current?.limit ?? 50),
          total: Math.max(current?.total ?? 0, withoutCreated.length + 1),
          limit: current?.limit ?? 50,
        },
      };
    });
    locateEntity(created);
    try {
      let refreshed = await fetchIssueFeed(owner);
      if (!refreshed.entities.some((entity) => entity.id === created.id)) {
        const entities = [created, ...refreshed.entities].slice(0, refreshed.limit);
        refreshed = { ...refreshed, entities, total: Math.max(refreshed.total, entities.length) };
      }
      issueSnapshotRef.current.set(owner, refreshed.entities);
      updateProject(owner, (entry) => ({ ...entry, issues: refreshed }));
    } catch {
      // The confirmed POST response remains authoritative when immediate refetch is unavailable.
    }
  };

  const reconcileMutatedEntity = async (entity: WorldEntity) => {
    const owner = entity.projectId || projectId;
    const replace = <T extends { entities: WorldEntity[] }>(current: T | undefined): T | undefined => current
      ? { ...current, entities: current.entities.map((candidate) => candidate.id === entity.id ? entity : candidate) }
      : current;
    updateProject(owner, (entry) => ({
      ...entry,
      assets: entity.type === "asset" ? replace(entry.assets) : entry.assets,
      issues: entity.type === "issue" ? replace(entry.issues) : entry.issues,
      forms: entity.type === "form" ? replace(entry.forms) : entry.forms,
    }));
    if (entity.type === "issue") {
      issueSnapshotRef.current.set(owner, (issueSnapshotRef.current.get(owner) ?? [])
        .map((candidate) => candidate.id === entity.id ? entity : candidate));
    }
    setSelectedEntityId(entity.id);
    setSelectedId(entity.zone ?? `${entity.type}s`);
    setPanelOpen(true);
    try {
      if (entity.type === "asset") {
        const feed = await fetchAssetFeed(owner);
        updateProject(owner, (entry) => ({ ...entry, assets: feed }));
      }
      if (entity.type === "issue") {
        const feed = await fetchIssueFeed(owner);
        issueSnapshotRef.current.set(owner, feed.entities);
        updateProject(owner, (entry) => ({ ...entry, issues: feed }));
      }
      if (entity.type === "form") {
        const feed = await fetchFormFeed(owner);
        updateProject(owner, (entry) => ({ ...entry, forms: feed }));
      }
    } catch {
      // The APS-confirmed mutation response remains visible until the next sync.
    }
  };

  /**
   * Read one compound. Every project reconciles on the same cycle and reports
   * its own failures, so one project missing a module — or answering 504 — never
   * empties the districts of the projects standing next to it.
   */
  const refreshProject = useCallback(async (project: WorldProjectRef): Promise<boolean> => {
    const id = project.id;
    const [assets, issues, people, documents, forms, rfis, relationships] = await Promise.allSettled([
      fetchAssetFeed(id),
      fetchIssueFeed(id),
      fetchPeopleFeed(id),
      fetchDocumentFeed(id),
      fetchFormFeed(id),
      fetchRfiFeed(id),
      fetchRelationshipFeed(id),
    ]);
    if (!mountedRef.current) return false;

    const failed = [assets, issues, people, documents, forms, rfis, relationships]
      .some((result) => result.status === "rejected" || !isSuccessfulFeed(result.value));

    if (issues.status === "fulfilled") {
      // Activity is diffed within a project. Comparing one project's issues to
      // another's would report every record as new the moment a compound loaded.
      const previous = issueSnapshotRef.current.get(id);
      if (previous) {
        const detected = detectIssueActivity(previous, issues.value.entities);
        if (detected.length) {
          setActivityEvents((current) => {
            const known = new Set(current.map((event) => event.id));
            return [...detected.filter((event) => !known.has(event.id)), ...current].slice(0, 12);
          });
          peekActivity();
        }
      }
      issueSnapshotRef.current.set(id, issues.value.entities);
    }

    updateProject(id, (entry) => ({
      ...entry,
      assets: assets.status === "fulfilled" ? assets.value : keepLastKnown(entry.assets, {
        state: "error", entities: [], total: 0, limit: 25, statuses: [], categories: [],
        error: errorMessage(assets.reason, "Assets could not be loaded."),
      }),
      issues: issues.status === "fulfilled" ? issues.value : keepLastKnown(entry.issues, {
        state: "error", entities: [], total: 0, limit: 50,
        error: errorMessage(issues.reason, "Issues could not be loaded."),
      }),
      people: people.status === "fulfilled" ? people.value : keepLastKnown(entry.people, {
        state: "error", entities: [], total: 0, limit: 100,
        error: errorMessage(people.reason, "Project users could not be loaded."),
      }),
      documents: documents.status === "fulfilled" ? documents.value : keepLastKnown(entry.documents, {
        state: "error", entities: [], total: 0, limit: 25,
        scope: "Top-level folders and the first accessible folder",
        error: errorMessage(documents.reason, "Documents could not be loaded."),
      }),
      forms: forms.status === "fulfilled" ? forms.value : keepLastKnown(entry.forms, {
        state: "error", entities: [], total: 0, limit: 25,
        error: errorMessage(forms.reason, "Forms could not be loaded."),
      }),
      rfis: rfis.status === "fulfilled" ? rfis.value : keepLastKnown(entry.rfis, {
        state: "error", entities: [], total: 0, limit: 50,
        error: errorMessage(rfis.reason, "RFIs could not be loaded."),
      }),
      relationships: relationships.status === "fulfilled" ? relationships.value : {
        state: "error", relationships: [], total: 0,
        error: errorMessage(relationships.reason, "Relationships could not be loaded."),
      },
    }));
    return failed;
  }, [updateProject]);

  const refreshWorld = useCallback((trigger: WorldSyncTrigger): Promise<void> => {
    if (syncInFlightRef.current) return syncInFlightRef.current;
    if (mountedRef.current) setSyncState("syncing");

    const request = Promise.all(projectsRef.current.map((project) => refreshProject(project)))
      .then((results) => {
        if (!mountedRef.current) return;
        setLastSyncedAt(Date.now());
        setSyncState(results.some(Boolean) ? "partial_error" : "current");
        if (trigger !== "interval") {
          console.info(`World reconciliation completed (${trigger}) for ${results.length} project(s).`);
        }
      })
      .finally(() => {
        syncInFlightRef.current = null;
      });
    syncInFlightRef.current = request;
    return request;
  }, [refreshProject]);

  useEffect(() => {
    mountedRef.current = true;
    let timer: number | undefined;
    let visibility = document.visibilityState;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        await refreshWorld("interval");
        if (mountedRef.current) schedule();
      }, syncIntervalForVisibility(document.visibilityState));
    };
    const onVisibilityChange = () => {
      const next = document.visibilityState;
      const refreshNow = shouldRefreshOnVisibilityChange(visibility, next);
      visibility = next;
      if (refreshNow) void refreshWorld("visible");
      schedule();
    };
    const onOnline = () => void refreshWorld("online");
    void refreshWorld("initial").finally(schedule);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", onOnline);
    return () => {
      mountedRef.current = false;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", onOnline);
    };
  }, [refreshWorld]);

  return (
    <div className="world-shell">
      <Canvas
        orthographic
        shadows
        dpr={[1, 1.75]}
        camera={{ position: [22, 26, 22], zoom: 19, near: -1200, far: 1200 }}
        onPointerMissed={() => { setSelectedId(null); setSelectedCompoundId(undefined); setSelectedProjectId(undefined); setRevealed(undefined); }}
        gl={{ antialias: true, alpha: false }}
      >
        {/* The clip range is symmetric and negative on the near side. An
            orthographic camera clips whatever falls in front of its own plane,
            and the ground running toward the viewer did exactly that: it was cut
            off in a hard straight line across the lower part of the frame.
            Background and fog share one colour so the far side dissolves into
            the horizon rather than ending at a visible edge. */}
        <color attach="background" args={["#d9e7dd"]} />
        <fog attach="fog" args={["#d9e7dd", 44, 104]} />
        <ambientLight intensity={.62} />
        <hemisphereLight args={["#fff4dc", "#93a86f", .72]} />
        <directionalLight
          castShadow
          intensity={1.7}
          color="#fff2d6"
          position={[14, 20, 10]}
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-34}
          shadow-camera-right={34}
          shadow-camera-top={34}
          shadow-camera-bottom={-34}
          shadow-bias={-0.0004}
        />
        {/* The ground is one plane under every compound, so it is drawn here
            rather than once per project. */}
        <GroundPlane />
        <WaterBodies bodies={meadowWater} />
        <MeadowProps compounds={compoundRects} water={meadowWater} />
        {compounds.map((compound) => (
          <group
            key={compound.entry.project.id}
            position={[compound.offset[0], 0, compound.offset[1]]}
          >
            <CompoundPlate
              bounds={compound.bounds}
              selected={selectedCompoundId === compound.entry.project.id}
              onSelect={() => selectCompound(compound.entry.project.id)}
              onFocus={() => { selectCompound(compound.entry.project.id); focusCompound(compound.entry.project.id); }}
            />
            <CompoundLabel
              name={compound.entry.project.name}
              bounds={compound.bounds}
              visible={compounds.length > 1}
              selected={selectedCompoundId === compound.entry.project.id}
            />
            <WorldScene
              projectId={compound.entry.project.id}
              selectedId={selectedId}
              selectedProjectId={selectedProjectId}
              positions={compound.positions}
              zones={compound.zones}
              onSelect={selectZone}
              onFocus={focusZone}
              assets={compound.entry.assets?.entities ?? []}
              assetCategories={compound.categories}
              assetYard={compound.yard}
              issues={compound.entry.issues?.entities ?? []}
              rfis={compound.entry.rfis?.entities ?? []}
              people={compound.entry.people?.entities ?? []}
              documents={compound.entry.documents?.entities ?? []}
              forms={compound.entry.forms?.entities ?? []}
              relationships={resolvedRelationships}
              relationshipFocusEntityId={relationshipFocusEntityId}
              workerActivity={workerActivity}
              selectedEntityId={selectedEntityId}
              highlightedIds={revealedIds}
              onAssetSelect={(asset) => {
                setSelectedEntityId(asset.id);
                setRelationshipFocusEntityId(undefined);
                if (asset.zone) setSelectedId(asset.zone);
                setPanelOpen(true);
              }}
              onIssueSelect={(issue) => {
                setSelectedEntityId(issue.id);
                setRelationshipFocusEntityId(undefined);
                setSelectedId("issues");
                setPanelOpen(true);
              }}
              onRfiSelect={(rfi) => {
                setSelectedEntityId(rfi.id);
                setRelationshipFocusEntityId(undefined);
                setSelectedId("rfis");
                setPanelOpen(true);
              }}
              onPersonSelect={(person) => {
                setSelectedEntityId(person.id);
                setRelationshipFocusEntityId(undefined);
                setSelectedId("people");
                setPanelOpen(true);
              }}
              onDocumentSelect={(document) => {
                setSelectedEntityId(document.id);
                setRelationshipFocusEntityId(undefined);
                setSelectedId("documents");
                setPanelOpen(true);
              }}
              onFormSelect={(form) => {
                setSelectedEntityId(form.id);
                setRelationshipFocusEntityId(undefined);
                setSelectedId("forms");
                setPanelOpen(true);
              }}
            />
          </group>
        ))}
        <CameraFocus request={focusRequest} controlsRef={controlsRef} zones={zones} positions={renderPositions} minZoom={minZoom} />
        <InteractionWatcher controlsRef={controlsRef} onInteract={() => setHasInteracted(true)} />
        <MapControls
          ref={controlsRef}
          makeDefault
          enableRotate={false}
          enableDamping
          dampingFactor={0.08}
          minZoom={minZoom}
          maxZoom={120}
          zoomSpeed={1}
          target={[0, 0, 2]}
        />
      </Canvas>

      <header className="world-hud">
        <button
          className="world-identity"
          type="button"
          onClick={() => setStatsOpen((open) => !open)}
          aria-expanded={statsOpen}
          aria-label={`Toggle live project counts (${worldTotal} live records)`}
        >
          <i className={`stats-dot state-${worldFeedsPending ? "loading" : syncState}`} />
          <span>{projects.length > 1 ? `${projects.length} projects` : projectName}</span>
        </button>
        {statsOpen && (
          <div className="stats-popover" role="dialog" aria-label="Live project entity counts">
            {projects.length > 1 && (
              <ul className="stats-projects">
                {compounds.map((compound) => (
                  <li key={compound.entry.project.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setStatsOpen(false);
                        setSelectedId("hub");
                        setFocusRequest({
                          zoneId: "hub",
                          serial: Date.now(),
                          projectId: compound.entry.project.id,
                          target: [
                            (compound.bounds.minX + compound.bounds.maxX) / 2 + compound.offset[0],
                            (compound.bounds.minZ + compound.bounds.maxZ) / 2 + compound.offset[1],
                          ],
                          fit: [
                            compound.bounds.maxX - compound.bounds.minX,
                            compound.bounds.maxZ - compound.bounds.minZ,
                          ],
                        });
                      }}
                    >
                      <strong>{compound.entry.project.name}</strong>
                      <small>
                        {[
                          compound.entry.assets?.total,
                          compound.entry.issues?.total,
                          compound.entry.rfis?.total,
                          compound.entry.people?.total,
                          compound.entry.documents?.total,
                          compound.entry.forms?.total,
                        ].reduce<number>((sum, total) => sum + (total ?? 0), 0)} records
                      </small>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="world-metrics">
              <FeedMetric label="Assets" feed={assetFeed} />
              <FeedMetric label="Issues" feed={issueFeed} />
              <FeedMetric label="RFIs" feed={rfiFeed} />
              <FeedMetric label="People" feed={peopleFeed} />
              <FeedMetric label="Docs" feed={documentFeed} />
              <FeedMetric label="Forms" feed={formFeed} />
              <FeedMetric label="Links" feed={relationshipFeed} />
            </div>
          </div>
        )}
        <nav className="world-toolbar" aria-label="World actions">
          <button className={`sync-badge sync-${syncState}`} type="button" onClick={() => void refreshWorld("manual")} disabled={syncState === "syncing"} title="Reconcile all world data with APS now">
            <i /> {syncState === "syncing" ? "Syncing…" : lastSyncedAt ? `Synced ${new Date(lastSyncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Waiting for APS"}
          </button>
          <div className="toolbar-menu">
            <button className="toolbar-button" type="button" onClick={() => setNavMenuOpen((open) => !open)} aria-expanded={navMenuOpen} aria-label="More world actions">⋯</button>
            {navMenuOpen && (
              <div className="toolbar-menu-panel" role="menu">
                <Link href="/project" className="toolbar-menu-item" role="menuitem" onClick={() => setNavMenuOpen(false)}>Project overview</Link>
                <form action="/api/projects/change" method="post"><button className="toolbar-menu-item" type="submit" role="menuitem">Switch project</button></form>
              </div>
            )}
          </div>
        </nav>
      </header>

      {/* One column down the left edge. Stacking the meter, the failed feeds and
          the digest in a single flow is what stops them overlapping each other
          when several are visible at once. */}
      <div className="world-rail">
        <XpMeter progression={progression} />
        <div className="world-feed-alerts">
          <FeedAlert label="Assets" feed={assetFeed} />
          <FeedAlert label="Issues" feed={issueFeed} />
          <FeedAlert label="RFIs" feed={rfiFeed} />
          <FeedAlert label="People" feed={peopleFeed} />
          <FeedAlert label="Documents" feed={documentFeed} />
          <FeedAlert label="Forms" feed={formFeed} />
          <FeedAlert label="Relationships" feed={relationshipFeed} />
        </div>
        {awayLogOpen && (
          <AwayLog
            events={awayLog}
            activeEventId={revealed?.id}
            arrival={digestIsArrival}
            onReveal={revealAway}
            onAcknowledge={acknowledgeAway}
            onDismiss={() => setAwayLogOpen(false)}
          />
        )}
      </div>

      <button
        className="activity-bell"
        type="button"
        onClick={toggleActivity}
        aria-expanded={activityOpen}
        aria-label={`Toggle live activity feed${activityEvents.length ? ` (${activityEvents.length} recent)` : ""}`}
      >
        <i />
        {activityEvents.length > 0 && <b>{activityEvents.length > 9 ? "9+" : activityEvents.length}</b>}
      </button>
      {activityOpen && (
        <ActivityLog
          events={activityEvents}
          people={peopleFeed?.entities ?? []}
          issues={issueFeed?.entities ?? []}
          onLocate={(entity) => { locateEntity(entity); setActivityOpen(false); }}
          onClose={() => setActivityOpen(false)}
        />
      )}

      {selectedEntity && panelOpen ? (
        selectedEntity.type === "issue"
          ? <IssueDetail entity={selectedEntity} projectName={projectName} actionSection={<WorldActionSection key={selectedEntity.id} entity={selectedEntity} onCompleted={reconcileMutatedEntity} />} relationshipSection={<RelationshipSection related={selectedRelationships} assetCategories={assetCategories} onLocate={locateEntity} />} onClose={() => setPanelOpen(false)} />
          : selectedEntity.type === "rfi"
          ? <RfiDetail entity={selectedEntity} projectName={projectName} relationshipSection={<RelationshipSection related={selectedRelationships} assetCategories={assetCategories} onLocate={locateEntity} />} onClose={() => setPanelOpen(false)} />
          : selectedEntity.type === "person"
            ? <PersonDetail entity={selectedEntity} projectName={projectName} actionSection={<CreateIssueAction onClick={() => setIssueComposer({ context: selectedEntity })} />} relationshipSection={<RelationshipSection related={selectedRelationships} assetCategories={assetCategories} onLocate={locateEntity} onLocateAll={selectedRelationships.some(({ entity }) => entity.type === "issue") ? locateAllPersonIssues : undefined} />} onClose={() => { setPanelOpen(false); setRelationshipFocusEntityId(undefined); }} />
            : selectedEntity.type === "document"
              ? <DocumentDetail entity={selectedEntity} projectName={projectName} scope={documentFeed?.scope} relationshipSection={<RelationshipSection related={selectedRelationships} assetCategories={assetCategories} onLocate={locateEntity} />} onClose={() => setPanelOpen(false)} />
              : selectedEntity.type === "form"
                ? <FormDetail entity={selectedEntity} projectName={projectName} actionSection={<WorldActionSection key={selectedEntity.id} entity={selectedEntity} onCompleted={reconcileMutatedEntity} />} relationshipSection={<RelationshipSection related={selectedRelationships} assetCategories={assetCategories} onLocate={locateEntity} />} onClose={() => setPanelOpen(false)} />
            : <AssetDetail entity={selectedEntity} projectName={projectName} actionSection={<><WorldActionSection key={selectedEntity.id} entity={selectedEntity} onCompleted={reconcileMutatedEntity} /><CreateIssueAction onClick={() => setIssueComposer({ context: selectedEntity })} /></>} relationshipSection={<RelationshipSection related={selectedRelationships} assetCategories={assetCategories} onLocate={locateEntity} />} onClose={() => setPanelOpen(false)} />
      ) : selectedCompound && panelOpen ? (
        <CompoundDetail
          compound={selectedCompound}
          onFocus={() => focusCompound(selectedCompound.entry.project.id)}
          onOpenDistrict={(zoneId) => focusZone(zoneId, selectedCompound.entry.project.id)}
          onClose={() => { setPanelOpen(false); setSelectedCompoundId(undefined); }}
        />
      ) : selectedZone && panelOpen && (
        <ZoneDetail
          zone={selectedZone}
          entities={selectedZoneEntities}
          assetStatuses={assetFeed?.statuses ?? []}
          assetCategories={assetCategories}
          reveal={revealed && revealed.zone === selectedZone.id
            ? { headline: revealed.headline, ids: revealedIds ?? new Set(), onClear: () => setRevealed(undefined) }
            : undefined}
          total={selectedZoneTotal}
          projectName={compounds.find((compound) => compound.entry.project.id === selectedProjectId)?.entry.project.name ?? projectName}
          projectId={projectId}
          onLocate={locateEntity}
          onClose={() => setPanelOpen(false)}
        />
      )}

      {issueComposer && (
        <IssueComposer
          context={issueComposer.context}
          people={peopleFeed?.entities ?? []}
          onClose={() => setIssueComposer(undefined)}
          onCreated={(issue) => reconcileCreatedIssue(issue)}
        />
      )}

      <WorldActionBar onResetView={resetView} onCreateIssue={() => setIssueComposer({})} />

      <div className={`world-controls ${hasInteracted ? "faded" : ""}`}>
        <span><b>Drag</b> pan</span>
        <span><b>Scroll</b> zoom</span>
        <span><b>Click</b> inspect</span>
        <span><b>Double-click</b> focus</span>
      </div>
    </div>
  );
}

type WorldFeed = AssetFeed | IssueFeed | RfiFeed | PeopleFeed | DocumentFeed | FormFeed | RelationshipFeed;

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

/**
 * A district that already showed real records must not go blank because one
 * refresh failed. The last known records stay on screen and the feed is marked
 * stale, so the alert can say the world is showing older data rather than
 * pretending the failure did not happen.
 */
function keepLastKnown<T extends { entities: WorldEntity[]; total: number }>(
  previous: T | undefined,
  failure: T,
): T {
  if (!previous || previous.entities.length === 0) return failure;
  return { ...failure, entities: previous.entities, total: previous.total, stale: true };
}

function isSuccessfulFeed(feed: WorldFeed): boolean {
  return feed.state === "available" || feed.state === "empty";
}

function FeedMetric({ label, feed }: { label: string; feed?: WorldFeed }) {
  const stale = feed && "stale" in feed && feed.stale === true;
  const value = !feed ? "—" : feed.state === "available" || feed.state === "empty" || stale ? feed.total : "!";
  return <div className={`world-metric metric-${feed?.state ?? "loading"}`}><strong>{value}</strong><span>{label}</span></div>;
}

function FeedAlert({ label, feed }: { label: string; feed?: WorldFeed }) {
  if (!feed || feed.state === "available" || feed.state === "empty") return null;
  const stale = "stale" in feed && feed.stale === true;
  return (
    <details className={`world-feed-alert ${stale ? "stale" : ""}`}>
      <summary>
        {label} {stale ? "not refreshed" : "unavailable"} {feed.httpStatus ? `· HTTP ${feed.httpStatus}` : ""}
      </summary>
      {stale && <p>Showing the last records APS returned. They may be out of date.</p>}
      {feed.error && <code>{feed.error}</code>}
    </details>
  );
}

function ActivityLog({
  events,
  people,
  issues,
  onLocate,
  onClose,
}: {
  events: IssueActivityEvent[];
  people: WorldEntity[];
  issues: WorldEntity[];
  onLocate: (entity: WorldEntity) => void;
  onClose: () => void;
}) {
  return (
    <aside className="world-activity" aria-live="polite">
      <button className="detail-close" type="button" onClick={onClose} aria-label="Close live activity">×</button>
      <header><span><i /> LIVE ACTIVITY</span><b>{events.length}</b></header>
      {events.length === 0 ? (
        <p>Watching APS for verified project changes.</p>
      ) : (
        <div className="activity-list">
          {events.slice(0, 6).map((event) => {
            const actor = people.find((person) => personMatchesActor(person, event.actorExternalId));
            const issue = issues.find((candidate) => candidate.id === event.issueId);
            const verb = event.kind === "status-changed" ? "changed status" : event.kind === "assignee-changed" ? "changed assignment" : "updated an issue";
            return (
              <button key={event.id} type="button" onClick={() => issue && onLocate(issue)} disabled={!issue}>
                <span><strong>{actor?.title ?? "Forma project activity"}</strong> {verb}</span>
                <b>{event.issueTitle}</b>
                <small>{event.detail} · {new Date(event.observedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small>
              </button>
            );
          })}
        </div>
      )}
    </aside>
  );
}

/**
 * The project name over its own compound, so a world holding several of them
 * can be read at a glance. Hidden for a single-project world, where the HUD
 * already says which project this is, and inert to the pointer like every other
 * overlay in the scene.
 */
/**
 * The meadow between and around the compounds.
 *
 * Laid out once for the whole world so nothing is scattered onto a compound —
 * a per-compound ring could only see its own wall, and reached further than the
 * gap between two projects, which put trees inside a neighbour's districts.
 */
function MeadowProps({
  compounds,
  water,
}: {
  compounds: CompoundRect[];
  water: WaterBody[];
}) {
  const spots = useMemo(() => {
    if (compounds.length === 0) return [];
    const area = compounds.reduce((total, rect) => ({
      minX: Math.min(total.minX, rect.minX),
      maxX: Math.max(total.maxX, rect.maxX),
      minZ: Math.min(total.minZ, rect.minZ),
      maxZ: Math.max(total.maxZ, rect.maxZ),
    }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
    const clear = (x: number, z: number) => compounds.every((rect) =>
      x < rect.minX - 1.2 || x > rect.maxX + 1.2 || z < rect.minZ - 1.2 || z > rect.maxZ + 1.2);

    const result: { position: [number, number]; seed: number }[] = [];
    const reach = 14;
    for (let gridX = area.minX - reach; gridX <= area.maxX + reach; gridX += 3.2) {
      for (let gridZ = area.minZ - reach; gridZ <= area.maxZ + reach; gridZ += 3.2) {
        const seed = hashText(`meadow:${Math.round(gridX * 10)}:${Math.round(gridZ * 10)}`);
        if (seed % 2 !== 0) continue;
        const x = gridX + ((seed % 100) / 100 - .5) * 2.4;
        const z = gridZ + (((seed >>> 8) % 100) / 100 - .5) * 2.4;
        if (!clear(x, z)) continue;
        if (!pointClearOfWater(water, x, z, .8)) continue;
        result.push({ position: [x, z], seed });
      }
    }
    return result.slice(0, 140);
  }, [compounds, water]);

  return <>{spots.map(({ position, seed }) => (
    <GroundProp key={`meadow:${position[0]}:${position[1]}`} position={[position[0], 0, position[1]]} seed={seed} />
  ))}</>;
}

/**
 * The whole compound as a click target, so a project behaves like a district:
 * one click selects it and opens its panel, a double-click frames it.
 *
 * It is the lowest thing in the compound and paints nothing, so a district, a
 * record or a wall standing on it is always hit first. The handler acts only
 * when the plate is the *nearest* intersection, which is what keeps it from
 * stealing a click meant for a cone or a crate above it.
 */
/**
 * One whole project's panel, the counterpart to a district's.
 *
 * A world holding several compounds needs a way to ask "what is this project?"
 * without first picking one of its districts. It reports only what that
 * compound's own feeds returned, so the numbers can never borrow from the
 * project standing next to it, and each district row opens the real district.
 */
function CompoundDetail({
  compound,
  onFocus,
  onOpenDistrict,
  onClose,
}: {
  compound: CompoundView;
  onFocus: () => void;
  onOpenDistrict: (zoneId: ZoneId) => void;
  onClose: () => void;
}) {
  const { entry, zones } = compound;
  const feeds: Array<{ label: string; feed?: { state: string; total: number; entities: unknown[]; error?: string }; zoneId: ZoneId }> = [
    { label: "Assets", feed: entry.assets, zoneId: ASSET_ZONE },
    { label: "Issues", feed: entry.issues, zoneId: "issues" },
    { label: "RFIs", feed: entry.rfis, zoneId: "rfis" },
    { label: "People", feed: entry.people, zoneId: "people" },
    { label: "Documents", feed: entry.documents, zoneId: "documents" },
    { label: "Forms", feed: entry.forms, zoneId: "forms" },
  ];
  const total = feeds.reduce((sum, row) => sum + (row.feed?.total ?? 0), 0);
  const failing = feeds.filter((row) => row.feed?.error);

  return (
    <aside className="world-detail compound-detail" aria-live="polite">
      <button className="detail-close" type="button" onClick={onClose} aria-label="Close project panel">×</button>
      <span className="detail-kicker">LIVE PROJECT</span>
      <h2>{entry.project.name}</h2>
      {entry.project.hubName && <p>{entry.project.hubName}</p>}
      <div className="zone-content-summary">
        <strong>{total}</strong>
        <span>{total === 1 ? "project record" : "project records"}</span>
        <small>Across {zones.length} districts in this compound</small>
      </div>
      <section className="zone-content-list" aria-label={`${entry.project.name} districts`}>
        <header><span>IN THIS PROJECT</span><b>{feeds.filter((row) => row.feed).length}</b></header>
        {feeds.map((row) => (
          <button
            className="compound-district-row"
            key={row.label}
            type="button"
            onClick={() => onOpenDistrict(row.zoneId)}
            disabled={!row.feed}
          >
            <span>{row.label}</span>
            <b>{row.feed ? row.feed.total : "—"}</b>
            <small>
              {!row.feed
                ? "loading"
                : row.feed.error
                  ? "unavailable"
                  : `${row.feed.entities.length} loaded`}
            </small>
          </button>
        ))}
      </section>
      {failing.length > 0 && (
        <p className="compound-detail-note">
          {failing.map((row) => row.label).join(", ")} could not be read for this project.
          The other districts are unaffected.
        </p>
      )}
      <div className="detail-actions">
        <button className="detail-action" type="button" onClick={onFocus}>Frame this project</button>
      </div>
    </aside>
  );
}

function CompoundPlate({
  bounds,
  selected,
  onSelect,
  onFocus,
}: {
  bounds: CompoundBounds;
  selected: boolean;
  onSelect: () => void;
  onFocus: () => void;
}) {
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  const nearest = (event: { intersections: Array<{ object: unknown }>; object: unknown }) =>
    event.intersections[0]?.object === event.object;
  return (
    <mesh
      position={[(bounds.minX + bounds.maxX) / 2, 0.0015, (bounds.minZ + bounds.maxZ) / 2]}
      rotation={[-Math.PI / 2, 0, 0]}
      onClick={(event) => {
        if (!nearest(event)) return;
        event.stopPropagation();
        onSelect();
      }}
      onDoubleClick={(event) => {
        if (!nearest(event)) return;
        event.stopPropagation();
        onFocus();
      }}
    >
      <planeGeometry args={[width, depth]} />
      <meshBasicMaterial
        color="#d8ef78"
        transparent
        opacity={selected ? 0.14 : 0}
        depthWrite={false}
      />
    </mesh>
  );
}

function CompoundLabel({
  name,
  bounds,
  visible,
  selected,
}: {
  name: string;
  bounds: CompoundBounds;
  visible: boolean;
  selected: boolean;
}) {
  if (!visible) return null;
  return (
    <Html
      position={[(bounds.minX + bounds.maxX) / 2, 3.4, bounds.minZ - 1.4]}
      center
      zIndexRange={[20, 0]}
      style={{ pointerEvents: "none" }}
    >
      {/* Inert, like every other overlay in the scene. It hangs off the front of
          its compound, which at overview zoom can put it over the compound
          behind — as a click target it would hand the pointer to the wrong
          project. The compound's own ground is the target instead. */}
      <span className={`compound-label${selected ? " selected" : ""}`}>{name}</span>
    </Html>
  );
}

function CameraFocus({
  request,
  controlsRef,
  zones,
  positions,
  minZoom,
}: {
  request?: FocusRequest;
  controlsRef: RefObject<MapControlsImpl | null>;
  zones: WorldZone[];
  positions: ZonePositions;
  /** The same floor the controls use, so a fit is never clamped past framing. */
  minZoom: number;
}) {
  const desiredTarget = useRef(new Vector3());
  const desiredZoom = useRef<number | undefined>(undefined);
  const lastRequestSerial = useRef<number | undefined>(undefined);
  const size = useThree((state) => state.size);

  useEffect(() => {
    if (!request || lastRequestSerial.current === request.serial) return;
    lastRequestSerial.current = request.serial;
    const zone = zones.find((candidate) => candidate.id === request.zoneId);
    if (!zone) return;
    const position = positions[request.zoneId];
    desiredTarget.current.set(request.target?.[0] ?? position[0], 0, request.target?.[1] ?? position[2]);
    if (request.fit) {
      // A footprint of width W and depth D projects to roughly (W + D) / SQRT2
      // across the isometric view and a flatter (W + D) * 0.41 down it. The
      // tighter of the two axes decides the zoom, then a margin keeps the wall
      // off the edge of the frame.
      const [width, depth] = request.fit;
      const diagonal = Math.max(1, width + depth);
      desiredZoom.current = MathUtils.clamp(
        Math.min(size.width / (diagonal / Math.SQRT2), size.height / (diagonal * .41)) * .78,
        minZoom,
        108,
      );
    } else {
      desiredZoom.current = request.zoom ?? MathUtils.clamp(500 / Math.max(zone.size[0], zone.size[1]), 60, 108);
    }
  }, [minZoom, positions, request, size, zones]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const cancelAutomaticFocus = () => { desiredZoom.current = undefined; };
    controls.addEventListener("start", cancelAutomaticFocus);
    return () => controls.removeEventListener("start", cancelAutomaticFocus);
  }, [controlsRef]);

  useFrame((state, delta) => {
    const controls = controlsRef.current;
    const targetZoom = desiredZoom.current;
    if (!controls || targetZoom === undefined) return;
    const camera = state.camera;
    const blend = 1 - Math.exp(-6 * delta);
    const movement = desiredTarget.current.clone().sub(controls.target).multiplyScalar(blend);
    controls.target.add(movement);
    camera.position.add(movement);
    camera.zoom = MathUtils.damp(camera.zoom, targetZoom, 6, delta);
    camera.updateProjectionMatrix();
    controls.update();
    if (controls.target.distanceTo(desiredTarget.current) < .015 && Math.abs(camera.zoom - targetZoom) < .1) {
      desiredZoom.current = undefined;
    }
  });
  return null;
}

function InteractionWatcher({
  controlsRef,
  onInteract,
}: {
  controlsRef: RefObject<MapControlsImpl | null>;
  onInteract: () => void;
}) {
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    controls.addEventListener("start", onInteract);
    return () => controls.removeEventListener("start", onInteract);
  }, [controlsRef, onInteract]);
  return null;
}

function WorldScene({
  projectId,
  selectedId,
  selectedProjectId,
  positions,
  zones,
  onSelect,
  onFocus,
  assets,
  assetCategories,
  assetYard,
  issues,
  rfis,
  people,
  documents,
  forms,
  relationships,
  relationshipFocusEntityId,
  workerActivity,
  selectedEntityId,
  highlightedIds,
  onAssetSelect,
  onIssueSelect,
  onRfiSelect,
  onPersonSelect,
  onDocumentSelect,
  onFormSelect,
}: {
  /** Which compound this scene is, so a click can say where it happened. */
  projectId: string;
  selectedId: ZoneId | null;
  /** The compound the selected district belongs to. */
  selectedProjectId?: string;
  positions: ZonePositions;
  zones: WorldZone[];
  onSelect: (id: ZoneId, projectId: string) => void;
  onFocus: (id: ZoneId, projectId: string) => void;
  assets: WorldEntity[];
  assetCategories: AssetCategoryOption[];
  assetYard: AssetYardPlan<WorldEntity>;
  issues: WorldEntity[];
  rfis: WorldEntity[];
  people: WorldEntity[];
  documents: WorldEntity[];
  forms: WorldEntity[];
  relationships: ResolvedRelationship[];
  relationshipFocusEntityId?: string;
  workerActivity: Map<string, IssueActivityEvent>;
  selectedEntityId?: string;
  /** Records the away digest is currently showing; they get a highlight ring. */
  highlightedIds?: Set<string>;
  onAssetSelect: (asset: WorldEntity) => void;
  onIssueSelect: (issue: WorldEntity) => void;
  onRfiSelect: (rfi: WorldEntity) => void;
  onPersonSelect: (person: WorldEntity) => void;
  onDocumentSelect: (document: WorldEntity) => void;
  onFormSelect: (form: WorldEntity) => void;
}) {
  const entityPositions = useMemo(() => buildEntityPositionMap({
    assets,
    assetCategories,
    assetYard,
    issues,
    people,
    documents,
    forms,
    positions,
    zones,
  }), [assets, assetCategories, assetYard, issues, people, documents, forms, positions, zones]);
  // The walled compound is derived from the districts it has to contain, so a
  // moved or grown district can never end up outside the wall.
  const bounds = useMemo(() => compoundBounds(zones, positions), [zones, positions]);
  const gates = useMemo(() => compoundGates(bounds), [bounds]);
  const paths = useMemo(() => districtPaths(zones, positions, gates, bounds), [zones, positions, gates, bounds]);
  const water = useMemo(() => waterBodies(bounds, zones, positions, paths), [bounds, zones, positions, paths]);
  const issueBays = useMemo(() => layoutIssueBays(issues), [issues]);
  const selectedIssueId = selectedEntityId && issues.some((issue) => issue.id === selectedEntityId)
    ? selectedEntityId
    : undefined;
  const wireAnchorId = relationshipFocusEntityId ?? selectedIssueId;
  return (
    <>
      <DirtPaths paths={paths} />
      <WaterBodies bodies={water} />
      <CompoundWall bounds={bounds} gates={gates} />
      <AmbientGroundProps zones={zones} positions={positions} bounds={bounds} paths={paths} water={water} />
      {zones.map((zone) => (
        <Zone
          key={zone.id}
          zone={zone}
          position={positions[zone.id]}
          // Every compound has an "issues" district. Only the one in the
          // compound that was clicked is the selected one.
          selected={selectedId === zone.id && (selectedProjectId === undefined || selectedProjectId === projectId)}
          onSelect={(id) => onSelect(id, projectId)}
          onFocus={(id) => onFocus(id, projectId)}
        />
      ))}
      {wireAnchorId && (
        <RelationshipWires
          relationships={relationships}
          entityPositions={entityPositions}
          anchorEntityId={wireAnchorId}
          issueTargetIds={relationshipFocusEntityId ? new Set(issues.map((issue) => issue.id)) : undefined}
        />
      )}
      <AssetYard
        plan={assetYard}
        categories={assetCategories}
        center={positions[ASSET_ZONE]}
        labelsVisible={selectedId === ASSET_ZONE}
        selectedAssetId={selectedEntityId}
        highlightedIds={highlightedIds}
        onSelect={onAssetSelect}
      />
      <IssueBays center={positions.issues} bays={issueBays} labelsVisible={selectedId === "issues"} />
      <IssueEntities
        bays={issueBays}
        entities={issues}
        center={positions.issues}
        selectedIssueId={selectedEntityId}
        highlightedIds={highlightedIds}
        onSelect={onIssueSelect}
      />
      <RfiEntities
        entities={rfis}
        center={positions.rfis}
        size={zones.find((zone) => zone.id === "rfis")?.size ?? [7.6, 6.2]}
        selectedRfiId={selectedEntityId}
        highlightedIds={highlightedIds}
        onSelect={onRfiSelect}
      />
      <PeopleEntities
        entities={people}
        center={positions.people}
        size={zones.find((zone) => zone.id === "people")?.size ?? [6.4, 5.4]}
        issueCenter={positions.issues}
        issueSize={zones.find((zone) => zone.id === "issues")?.size ?? [10.4, 7.6]}
        travelObstacles={zones
          .filter((zone) => zone.id !== "people" && zone.id !== "issues")
          .map((zone) => ({ id: zone.id, size: zone.size, position: positions[zone.id] }))}
        workerActivity={workerActivity}
        selectedPersonId={selectedEntityId}
        highlightedIds={highlightedIds}
        onSelect={onPersonSelect}
      />
      <DocumentEntities
        entities={documents}
        center={positions.documents}
        size={zones.find((zone) => zone.id === "documents")?.size ?? [5.8, 4.8]}
        selectedDocumentId={selectedEntityId}
        onSelect={onDocumentSelect}
      />
      <FormEntities
        entities={forms}
        center={positions.forms}
        size={zones.find((zone) => zone.id === "forms")?.size ?? [5.8, 4.8]}
        selectedFormId={selectedEntityId}
        highlightedIds={highlightedIds}
        onSelect={onFormSelect}
      />
    </>
  );
}

// Decorative-only filler: greenery inside the compound between the districts and
// paths, plus a loose meadow ring outside the wall. Never a connection between
// two districts and never mistakable for a project record.
function AmbientGroundProps({
  zones,
  positions,
  bounds,
  paths,
  water,
}: {
  zones: WorldZone[];
  positions: ZonePositions;
  bounds: CompoundBounds;
  paths: GroundPath[];
  water: WaterBody[];
}) {
  const spots = useMemo(() => {
    const clearOfZones = (x: number, z: number) => zones.every((zone) => {
      const center = positions[zone.id];
      const marginX = zone.size[0] / 2 + 1.1;
      const marginZ = zone.size[1] / 2 + 1.1;
      return Math.abs(x - center[0]) > marginX || Math.abs(z - center[2]) > marginZ;
    });
    const insideWall = (x: number, z: number, inset: number) => x > bounds.minX + inset
      && x < bounds.maxX - inset
      && z > bounds.minZ + inset
      && z < bounds.maxZ - inset;
    const result: { position: [number, number]; seed: number }[] = [];
    // Only the ground inside this compound's own wall. The meadow beyond it is
    // shared with whatever compound stands next door, so it is scattered once at
    // world level instead of by each compound reaching past its own wall.
    for (let gridX = bounds.minX; gridX <= bounds.maxX; gridX += 3.2) {
      for (let gridZ = bounds.minZ; gridZ <= bounds.maxZ; gridZ += 3.2) {
        const seed = hashText(`${Math.round(gridX * 10)}:${Math.round(gridZ * 10)}`);
        const x = gridX + ((seed % 100) / 100 - .5) * 2.4;
        const z = gridZ + (((seed >>> 8) % 100) / 100 - .5) * 2.4;
        // The wall walkway itself stays clear so nothing grows through the stone.
        if (!insideWall(x, z, 1.6)) continue;
        // Nothing is scattered into the water.
        if (!pointClearOfWater(water, x, z, .8)) continue;
        if (seed % 3 !== 0 || !clearOfZones(x, z) || !pointClearOfPaths(paths, x, z, .7)) continue;
        result.push({ position: [x, z], seed });
      }
    }
    return result.slice(0, 48);
  }, [zones, positions, bounds, paths, water]);
  return <>{spots.map(({ position, seed }) => (
    <GroundProp key={`${position[0]}:${position[1]}`} position={[position[0], 0, position[1]]} seed={seed} />
  ))}</>;
}

// Village filler on the open grass: pine trees, site barrels, stacked crates and
// the odd rock. Deliberately unlike every entity mesh so scenery can never be
// counted as project data.
// Filler on the open grass between the districts. It is deliberately unlike
// every entity mesh, and none of it takes part in raycasting, so no piece of
// scenery can be counted as a project record or swallow a click meant for one.
function GroundProp({ position, seed }: { position: [number, number, number]; seed: number }) {
  const kind = seed % 12;
  if (kind < 5) return <PineTree position={position} seed={seed} />;
  if (kind < 8) return <Bush position={position} seed={seed} />;
  if (kind < 11) return <RockCluster position={position} seed={seed} />;
  return <Wheelbarrow position={position} rotation={((seed >>> 4) % 360) * (Math.PI / 180)} />;
}

interface EntityPositionInput {
  assets: WorldEntity[];
  assetCategories: AssetCategoryOption[];
  assetYard: AssetYardPlan<WorldEntity>;
  issues: WorldEntity[];
  people: WorldEntity[];
  documents: WorldEntity[];
  forms: WorldEntity[];
  positions: ZonePositions;
  zones: WorldZone[];
}

/** The APS status id an asset carries, used to pick its lane in the yard. */
function assetStatusIdOf(entity: WorldEntity): string | undefined {
  const statusId = entity.metadata.statusId;
  return typeof statusId === "string" && statusId ? statusId : undefined;
}

/** How one asset's material looks, from its APS category or whatever it carries. */
function assetLook(entity: WorldEntity, categories: AssetCategoryOption[]): AssetAppearance {
  const categoryId = typeof entity.metadata.categoryId === "string" ? entity.metadata.categoryId : undefined;
  const categoryText = typeof entity.metadata.categoryText === "string"
    ? entity.metadata.categoryText
    : typeof entity.metadata.categoryName === "string" ? entity.metadata.categoryName : undefined;
  return assetAppearance({ categoryId, categoryText, title: entity.title, externalId: entity.externalId }, categories);
}

function buildEntityPositionMap(input: EntityPositionInput): Map<string, [number, number, number]> {
  const result = new Map<string, [number, number, number]>();
  const yardCenter = input.positions[ASSET_ZONE];
  if (yardCenter) {
    for (const { asset, offset } of input.assetYard.placements) {
      result.set(asset.id, [yardCenter[0] + offset[0], .5, yardCenter[2] + offset[1]]);
    }
  }

  const issueOffsets = issueMarkerOffsets(layoutIssueBays(input.issues));
  for (const entity of input.issues) {
    const offset = issueOffsets.get(entity.id) ?? [0, 0];
    result.set(entity.id, [input.positions.issues[0] + offset[0], .42, input.positions.issues[2] + offset[1]]);
  }

  const peopleSize = input.zones.find((zone) => zone.id === "people")?.size ?? [6.4, 5.4];
  const peopleLayout = layoutPeople(input.people.length, peopleSize);
  input.people.forEach((entity, index) => {
    const offset = peopleLayout.offsets[index];
    result.set(entity.id, [
      input.positions.people[0] + offset[0],
      .95,
      input.positions.people[2] + offset[1],
    ]);
  });

  const addGrid = (entities: WorldEntity[], zoneId: "documents" | "forms", stepX: number, stepZ: number, zOffset: number) => {
    const size = input.zones.find((zone) => zone.id === zoneId)?.size ?? [5.8, 4.8];
    const columns = Math.min(Math.max(1, Math.floor((size[0] - 1.2) / stepX)), Math.max(1, Math.ceil(Math.sqrt(entities.length))));
    const rows = Math.max(1, Math.ceil(entities.length / columns));
    entities.forEach((entity, index) => {
      const row = Math.floor(index / columns);
      const column = index % columns;
      result.set(entity.id, [
        input.positions[zoneId][0] + (column - (columns - 1) / 2) * stepX,
        .6,
        input.positions[zoneId][2] + zOffset + (row - (rows - 1) / 2) * stepZ,
      ]);
    });
  };
  addGrid(input.documents, "documents", .62, .58, .95);
  addGrid(input.forms, "forms", .58, .56, .9);
  return result;
}

function RelationshipWires({
  relationships,
  entityPositions,
  anchorEntityId,
  issueTargetIds,
}: {
  relationships: ResolvedRelationship[];
  entityPositions: Map<string, [number, number, number]>;
  anchorEntityId: string;
  issueTargetIds?: Set<string>;
}) {
  const visible = [...relationships]
    .filter((relationship) => {
      const linked = relationship.sourceEntityId === anchorEntityId || relationship.targetEntityId === anchorEntityId;
      const otherId = relationship.sourceEntityId === anchorEntityId ? relationship.targetEntityId : relationship.sourceEntityId;
      return linked
        && (!issueTargetIds || issueTargetIds.has(otherId))
        && entityPositions.has(relationship.sourceEntityId)
        && entityPositions.has(relationship.targetEntityId);
    })
    .slice(0, 32);
  return <group>{visible.map((relationship) => (
    <RelationshipWire
      key={relationship.id}
      relationship={relationship}
      start={entityPositions.get(relationship.sourceEntityId)!}
      end={entityPositions.get(relationship.targetEntityId)!}
    />
  ))}</group>;
}

function RelationshipWire({
  relationship,
  start,
  end,
}: {
  relationship: ResolvedRelationship;
  start: [number, number, number];
  end: [number, number, number];
}) {
  const pulse = useRef<Group>(null);
  const startVector = useMemo(() => new Vector3(...start), [start]);
  const endVector = useMemo(() => new Vector3(...end), [end]);
  const control = useMemo(() => {
    const distance = startVector.distanceTo(endVector);
    return startVector.clone().add(endVector).multiplyScalar(.5).setY(MathUtils.clamp(distance * .16, 1.45, 4.2));
  }, [endVector, startVector]);
  const points = useMemo(() => Array.from({ length: 25 }, (_, index) => {
    const t = index / 24;
    const inverse = 1 - t;
    return new Vector3(
      inverse * inverse * startVector.x + 2 * inverse * t * control.x + t * t * endVector.x,
      inverse * inverse * startVector.y + 2 * inverse * t * control.y + t * t * endVector.y,
      inverse * inverse * startVector.z + 2 * inverse * t * control.z + t * t * endVector.z,
    );
  }), [control, endVector, startVector]);
  const phaseOffset = useMemo(() => (hashText(relationship.id) % 1000) / 1000, [relationship.id]);
  useFrame(({ clock }) => {
    if (!pulse.current) return;
    const phase = (clock.getElapsedTime() * .34 + phaseOffset) % 2;
    const t = phase <= 1 ? phase : 2 - phase;
    const inverse = 1 - t;
    pulse.current.position.set(
      inverse * inverse * startVector.x + 2 * inverse * t * control.x + t * t * endVector.x,
      inverse * inverse * startVector.y + 2 * inverse * t * control.y + t * t * endVector.y,
      inverse * inverse * startVector.z + 2 * inverse * t * control.z + t * t * endVector.z,
    );
  });
  const color = relationship.type === "issue-assignee" ? "#64c6f2" : "#3f9de0";
  return (
    <group>
      <Line points={points} color="#8fd8ff" transparent opacity={.2} lineWidth={5.2} />
      <Line points={points} color={color} transparent opacity={.95} lineWidth={2.25} />
      <group ref={pulse}>
        <mesh><sphereGeometry args={[.18, 12, 10]} /><meshBasicMaterial color="#6fc8f5" transparent opacity={.2} /></mesh>
        <mesh><sphereGeometry args={[.095, 12, 10]} /><meshBasicMaterial color="#e0f7ff" /></mesh>
      </group>
    </group>
  );
}

// Marked-out repair bays on the yard dirt: gravel pad, corner posts and a status
// sign. Architecture only — the equipment standing in a bay is the real issue.
// Marked-out working bays painted straight onto the asphalt. Line markings and
// a status board only — the issue district carries no building, so the cones
// standing in a bay are the only objects in it.
// Painted working bays on the asphalt. Both the marking and the cones inside it
// are sized from the records actually loaded, so a busy state gets a bigger box
// rather than cones spilling onto the road.
function IssueBays({
  center,
  bays,
  labelsVisible,
}: {
  center: [number, number, number];
  bays: IssueBay[];
  labelsVisible: boolean;
}) {
  return <>{bays.map((bay) => {
    const color = issueStateColor(bay.state);
    const halfWidth = bay.size[0] / 2;
    const halfDepth = bay.size[1] / 2;
    return (
      <group key={bay.state} position={[center[0] + bay.center[0], 0, center[2] + bay.center[1]]}>
        {/* Painted outline in the state colour */}
        {[
          [0, -halfDepth, bay.size[0], .08],
          [0, halfDepth, bay.size[0], .08],
          [-halfWidth, 0, .08, bay.size[1]],
          [halfWidth, 0, .08, bay.size[1]],
        ].map(([x, z, width, depth], index) => (
          <mesh key={index} rotation={[-Math.PI / 2, 0, 0]} position={[x, .022, z]}>
            <planeGeometry args={[width, depth]} />
            <meshStandardMaterial color={color} roughness={.85} />
          </mesh>
        ))}
        {labelsVisible && (
          <Html position={[0, .3, halfDepth + .3]} center zIndexRange={[1, 0]} style={{ pointerEvents: "none" }}>
            <span className="issue-garden-label">{bay.label}</span>
          </Html>
        )}
      </group>
    );
  })}</>;
}

/**
 * The ring that marks a record the away digest is pointing at. It is a different
 * colour and a wider radius than the selection ring on purpose: a reader can
 * have one record selected while a whole group is being shown, and the two must
 * not look like the same thing.
 */
function HighlightRing({ y = .012, radius = .44 }: { y?: number; radius?: number }) {
  const ring = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (!ring.current) return;
    const time = clock.getElapsedTime();
    ring.current.scale.setScalar(1 + Math.sin(time * 2.6) * .09);
    (ring.current.material as MeshBasicMaterial).opacity = .42 + Math.sin(time * 2.6) * .16;
  });
  return (
    <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]} raycast={ignoreRaycast}>
      <ringGeometry args={[radius, radius + .1, 32]} />
      <meshBasicMaterial color="#ffb43c" transparent opacity={.5} depthWrite={false} />
    </mesh>
  );
}

function SelectionRing({ color, y = .015 }: { color: string; y?: number }) {
  const ring = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (!ring.current) return;
    ring.current.scale.setScalar(1 + Math.sin(clock.getElapsedTime() * 2.2) * .05);
  });
  return (
    <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]}>
      <ringGeometry args={[.3, .37, 32]} />
      <meshBasicMaterial color={color} transparent opacity={.45} />
    </mesh>
  );
}

/**
 * The Material Yard: one district holding the whole asset workflow, read left to
 * right. Material arrives at the intake end, waits in the lane for its current
 * APS status, and leaves from the dispatch end. A status change moves an asset
 * one lane along the same yard.
 */
function AssetYard({
  plan,
  categories,
  center,
  labelsVisible,
  selectedAssetId,
  highlightedIds,
  onSelect,
}: {
  plan: AssetYardPlan<WorldEntity>;
  categories: AssetCategoryOption[];
  center?: [number, number, number];
  labelsVisible: boolean;
  selectedAssetId?: string;
  highlightedIds?: Set<string>;
  onSelect: (asset: WorldEntity) => void;
}) {
  if (!center) return null;
  const half = plan.size[1] / 2;
  return (
    <group position={[center[0], 0, center[2]]}>
      <group position={[plan.intakeX, 0, 0]}><YardIntake /></group>
      <group position={[plan.dispatchX, 0, 0]}><YardDispatch /></group>
      {plan.lanes.map((lane, index) => (
        <group key={lane.statusId ?? "unknown"} position={[lane.x, 0, 0]}>
          {/* Painted lane divider and a marker post, so the statuses read as
              separate bays without a permanent name floating over the yard. */}
          {index > 0 && (
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-lane.width / 2, .02, 0]}>
              <planeGeometry args={[.09, plan.size[1] - .6]} />
              <meshStandardMaterial color="#e6e0cf" roughness={.9} />
            </mesh>
          )}
          <group position={[0, 0, -half + .55]}>
            <mesh castShadow position={[0, .28, 0]}><cylinderGeometry args={[.035, .045, .56, 6]} /><meshStandardMaterial color={STEEL} roughness={.5} metalness={.4} /></mesh>
            <mesh castShadow position={[0, .64, 0]}><boxGeometry args={[Math.min(1.5, lane.width * .5), .22, .05]} /><meshStandardMaterial color={LANE_COLORS[index % LANE_COLORS.length]} roughness={.65} /></mesh>
          </group>
          {labelsVisible && (
            <Html position={[0, .95, -half + .55]} center zIndexRange={[1, 0]} style={{ pointerEvents: "none" }}>
              <span className="issue-garden-label">{lane.label}</span>
            </Html>
          )}
        </group>
      ))}
      {plan.placements.map(({ asset, offset }) => (
        <AssetStack
          key={asset.id}
          entity={asset}
          look={assetLook(asset, categories)}
          position={[offset[0], 0, offset[1]]}
          selected={selectedAssetId === asset.id}
          highlighted={highlightedIds?.has(asset.id) ?? false}
          onSelect={onSelect}
        />
      ))}
    </group>
  );
}

const LANE_COLORS = ["#4fa3c7", "#f07f2c", "#26a69a", "#8e7cc3", "#7cb342", "#d4585f", "#3f8fd4", "#c9a227"];

/** Where material arrives: a flatbed backed up to an unloading ramp. */
function YardIntake() {
  const beacon = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (!beacon.current) return;
    const material = beacon.current.material as MeshBasicMaterial;
    material.opacity = .3 + Math.abs(Math.sin(clock.getElapsedTime() * 3)) * .7;
  });
  return (
    <group>
      <group position={[-.4, 0, -1.5]}><SiteTruck color="#4fa3c7" /></group>
      <mesh castShadow receiveShadow position={[0, .12, .5]} rotation={[-.22, 0, 0]}>
        <boxGeometry args={[2.2, .08, 1.2]} />
        <meshStandardMaterial color={STEEL_LIGHT} roughness={.7} metalness={.2} />
      </mesh>
      {/* Goods-in marker: a short mast with a flashing lamp */}
      <mesh castShadow position={[1.5, .6, 1.5]}><cylinderGeometry args={[.045, .055, 1.2, 6]} /><meshStandardMaterial color={STEEL} roughness={.5} metalness={.4} /></mesh>
      <mesh ref={beacon} position={[1.5, 1.28, 1.5]}><sphereGeometry args={[.11, 10, 8]} /><meshBasicMaterial color="#ffb43c" transparent opacity={.5} /></mesh>
      <mesh castShadow position={[1.5, 1.02, 1.5]}><boxGeometry args={[.28, .1, .28]} /><meshStandardMaterial color={STEEL_DARK} roughness={.6} /></mesh>
    </group>
  );
}

/** Where material leaves: a loading deck, a working gantry and a loaded lorry. */
function YardDispatch() {
  const hoist = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (hoist.current) hoist.current.position.y = -.3 + Math.sin(clock.getElapsedTime() * .8) * .2;
  });
  return (
    <group>
      <mesh castShadow receiveShadow position={[0, .2, -.9]}><boxGeometry args={[2.6, .4, 1.4]} /><meshStandardMaterial color={STEEL_LIGHT} roughness={.7} metalness={.2} /></mesh>
      {[-1.0, -.34, .34, 1.0].map((x) => (
        <mesh key={x} position={[x, .2, -.2]}><boxGeometry args={[.1, .42, .04]} /><meshStandardMaterial color="#26a69a" roughness={.6} /></mesh>
      ))}
      {/* Wrapped pallets waiting to go out */}
      {[[-.7, -1.1], [.5, -.8]].map(([x, z], index) => (
        <group key={index} position={[x, .4, z]}>
          <mesh castShadow><boxGeometry args={[.5, .4, .46]} /><meshStandardMaterial color="#cfd8dc" roughness={.55} transparent opacity={.85} /></mesh>
          <mesh><boxGeometry args={[.52, .06, .48]} /><meshStandardMaterial color="#26a69a" roughness={.7} /></mesh>
        </group>
      ))}
      {/* Gantry over the deck */}
      <group position={[0, 0, -.9]}>
        {[-1.25, 1.25].map((x) => (
          <mesh key={x} castShadow position={[x, .85, 0]}><boxGeometry args={[.1, 1.7, .1]} /><meshStandardMaterial color={STEEL} roughness={.5} metalness={.4} /></mesh>
        ))}
        <mesh castShadow position={[0, 1.74, 0]}><boxGeometry args={[2.7, .12, .14]} /><meshStandardMaterial color="#26a69a" roughness={.55} metalness={.3} /></mesh>
        <group position={[.5, 1.68, 0]}>
          <mesh position={[0, -.16, 0]}><cylinderGeometry args={[.012, .012, .32, 6]} /><meshStandardMaterial color={STEEL_DARK} /></mesh>
          <group ref={hoist}><mesh castShadow><boxGeometry args={[.36, .32, .32]} /><meshStandardMaterial color={WOOD_LIGHT} roughness={.9} /></mesh></group>
        </group>
      </group>
      <group position={[.2, 0, 1.4]} rotation={[0, Math.PI, 0]}><SiteTruck color="#26a69a" loaded /></group>
    </group>
  );
}

/** Flatbed lorry built from primitives; shared by the intake and dispatch ends. */
function SiteTruck({ color, loaded = false }: { color: string; loaded?: boolean }) {
  return (
    <group>
      <mesh castShadow receiveShadow position={[-.62, .38, 0]}><boxGeometry args={[.7, .52, .78]} /><meshStandardMaterial color={color} roughness={.55} metalness={.2} /></mesh>
      <mesh position={[-.62, .52, .4]}><boxGeometry args={[.5, .24, .02]} /><meshStandardMaterial color="#8fc4d6" roughness={.3} metalness={.2} /></mesh>
      <mesh castShadow receiveShadow position={[.35, .3, 0]}><boxGeometry args={[1.3, .12, .78]} /><meshStandardMaterial color={STEEL_LIGHT} roughness={.7} metalness={.2} /></mesh>
      {[-.36, .36].map((z) => (
        <mesh key={z} position={[.35, .4, z]}><boxGeometry args={[1.3, .1, .05]} /><meshStandardMaterial color={STEEL_DARK} roughness={.6} /></mesh>
      ))}
      {loaded && (
        <group position={[.35, .48, 0]}>
          {[-.32, .08, .42].map((x, index) => (
            <mesh key={x} castShadow position={[x, .12, 0]}>
              <boxGeometry args={[.3, .24, .5]} />
              <meshStandardMaterial color={index % 2 === 0 ? WOOD_LIGHT : PANEL} roughness={.9} />
            </mesh>
          ))}
        </group>
      )}
      {[[-.62, -.4], [-.62, .4], [.2, -.4], [.2, .4], [.72, -.4], [.72, .4]].map(([x, z], index) => (
        <mesh key={index} castShadow position={[x, .16, z]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[.16, .16, .1, 12]} />
          <meshStandardMaterial color="#33383c" roughness={.85} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * A real asset is a stack of material standing in the yard. Its form and colour
 * come from the asset's APS category where the project populates one, and
 * otherwise from a hash of what the record itself carries — so a yard is always
 * a readable mix of timber, pipe, drums and panels rather than a grey grid.
 */
function AssetStack({
  entity,
  look,
  position,
  selected,
  highlighted,
  onSelect,
}: {
  entity: WorldEntity;
  look: AssetAppearance;
  position: [number, number, number];
  selected: boolean;
  highlighted: boolean;
  onSelect: (asset: WorldEntity) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const body = selected ? "#d8ef78" : hovered ? "#f2d99a" : look.color;
  const trim = selected ? "#a9c246" : look.accent;
  return (
    <group
      position={position}
      // Material is the point of the yard, so a stack is drawn large enough to
      // read at the default camera distance.
      scale={selected ? 1.5 : hovered ? 1.42 : 1.32}
      onPointerOver={(event) => { event.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
      onClick={(event) => { event.stopPropagation(); onSelect(entity); }}
    >
      {/* One click target for the whole stack, matched to its own silhouette so
          it cannot swallow the hover of the stack behind it. */}
      <mesh position={[0, .2, 0]}>
        <boxGeometry args={[.47, .44, .44]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <MaterialForm form={look.form} body={body} trim={trim} />
      {highlighted && <HighlightRing y={.014} radius={.38} />}
      {selected && <SelectionRing color="#d8ef78" y={.02} />}
      {(selected || hovered) && (
        <Html position={[0, .72, 0]} center zIndexRange={[1, 0]} style={{ pointerEvents: "none" }}>
          <div className="asset-world-label">{entity.title}</div>
        </Html>
      )}
    </group>
  );
}

function MaterialForm({ form, body, trim }: { form: AssetForm; body: string; trim: string }) {
  switch (form) {
    case "lumber":
      return (
        <group>
          {[0, 1, 2].map((layer) => (
            <group key={layer} position={[0, .045 + layer * .085, 0]} rotation={[0, layer % 2 === 0 ? 0 : Math.PI / 2, 0]}>
              {[-.1, 0, .1].map((offset) => (
                <mesh key={offset} castShadow receiveShadow position={[offset, 0, 0]}>
                  <boxGeometry args={[.085, .08, .46]} />
                  <meshStandardMaterial color={layer % 2 === 0 ? body : trim} roughness={.92} />
                </mesh>
              ))}
            </group>
          ))}
        </group>
      );
    case "pipes":
      return (
        <group>
          {[-.16, .16].map((z) => (
            <mesh key={z} castShadow position={[0, .035, z]}><boxGeometry args={[.5, .07, .09]} /><meshStandardMaterial color={trim} roughness={.7} /></mesh>
          ))}
          {[[-.13, .13], [0, .13], [.13, .13], [-.065, .245], [.065, .245]].map(([x, y], index) => (
            <mesh key={index} castShadow position={[x, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[.062, .062, .44, 10]} />
              <meshStandardMaterial color={body} roughness={.4} metalness={.5} />
            </mesh>
          ))}
        </group>
      );
    case "pallet":
      return (
        <group>
          <mesh castShadow receiveShadow position={[0, .035, 0]}><boxGeometry args={[.5, .07, .44]} /><meshStandardMaterial color={trim} roughness={.85} /></mesh>
          {[[-.11, .12, -.09], [.11, .12, -.09], [-.11, .12, .09], [.11, .12, .09], [0, .26, 0]].map(([x, y, z], index) => (
            <mesh key={index} castShadow position={[x, y, z]} rotation={[0, index * .3, 0]}>
              <boxGeometry args={[.21, .1, .17]} />
              <meshStandardMaterial color={body} roughness={.95} />
            </mesh>
          ))}
          <mesh position={[0, .19, 0]}><boxGeometry args={[.5, .025, .03]} /><meshStandardMaterial color={trim} roughness={.7} /></mesh>
        </group>
      );
    case "drums":
      return (
        <group>
          <mesh castShadow receiveShadow position={[0, .03, 0]}><boxGeometry args={[.48, .06, .44]} /><meshStandardMaterial color={trim} roughness={.85} /></mesh>
          {[[-.11, -.09], [.11, -.09], [-.11, .09], [.11, .09]].map(([x, z], index) => (
            <group key={index} position={[x, 0, z]}>
              <mesh castShadow position={[0, .21, 0]}><cylinderGeometry args={[.1, .095, .3, 10]} /><meshStandardMaterial color={body} roughness={.6} metalness={.2} /></mesh>
              {[.15, .27].map((y) => (
                <mesh key={y} position={[0, y, 0]}><cylinderGeometry args={[.105, .105, .022, 10]} /><meshStandardMaterial color={trim} roughness={.5} metalness={.35} /></mesh>
              ))}
            </group>
          ))}
        </group>
      );
    case "panels":
      return (
        <group>
          <mesh castShadow receiveShadow position={[0, .03, 0]}><boxGeometry args={[.5, .06, .3]} /><meshStandardMaterial color={trim} roughness={.85} /></mesh>
          {/* Sheets leaning in an A-frame rack */}
          {[-1, 1].map((side) => (
            <group key={side}>
              {[0, 1, 2].map((index) => (
                <mesh key={index} castShadow position={[side * (.07 + index * .045), .26, 0]} rotation={[0, 0, side * .16]}>
                  <boxGeometry args={[.035, .42, .38]} />
                  <meshStandardMaterial color={index % 2 === 0 ? body : trim} roughness={.75} />
                </mesh>
              ))}
            </group>
          ))}
          <mesh castShadow position={[0, .3, 0]}><boxGeometry args={[.04, .5, .05]} /><meshStandardMaterial color={trim} roughness={.6} metalness={.3} /></mesh>
        </group>
      );
    case "fittings":
      return (
        <group>
          {/* Open crate of small parts */}
          <mesh castShadow receiveShadow position={[0, .11, 0]}><boxGeometry args={[.44, .22, .4]} /><meshStandardMaterial color={trim} roughness={.9} /></mesh>
          <mesh position={[0, .22, 0]}><boxGeometry args={[.38, .02, .34]} /><meshStandardMaterial color={body} roughness={.8} /></mesh>
          {[[-.1, .07], [.08, -.06], [.02, .11], [-.06, -.1]].map(([x, z], index) => (
            <mesh key={index} castShadow position={[x, .28, z]} rotation={[index * .5, index * .8, 0]}>
              <torusGeometry args={[.055, .022, 6, 10]} />
              <meshStandardMaterial color={body} roughness={.45} metalness={.5} />
            </mesh>
          ))}
        </group>
      );
  }
}

function IssueEntities({
  bays,
  entities,
  center,
  selectedIssueId,
  highlightedIds,
  onSelect,
}: {
  bays: IssueBay[];
  entities: WorldEntity[];
  center: [number, number, number];
  selectedIssueId?: string;
  highlightedIds?: Set<string>;
  onSelect: (issue: WorldEntity) => void;
}) {
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  return <>{bays.flatMap((bay) => bay.markers.map((marker) => {
    const entity = byId.get(marker.id);
    if (!entity) return null;
    return (
      <IssueMarker
        key={entity.id}
        entity={entity}
        position={[
          center[0] + bay.center[0] + marker.offset[0],
          0,
          center[2] + bay.center[1] + marker.offset[1],
        ]}
        scale={bay.coneScale}
        selected={selectedIssueId === entity.id}
        highlighted={highlightedIds?.has(entity.id) ?? false}
        onSelect={onSelect}
      />
    );
  }))}</>;
}

// A real issue is a piece of broken equipment standing in a repair bay: a
// barricade around a failed machine, still smoking while the issue is open or
// overdue and quiet once it has been answered or closed.
// One real issue is one traffic cone standing on the asphalt. The cone colour is
// the issue's authoritative APS state and nothing else: red is open, deep red is
// overdue, yellow is answered/waiting, green is closed, grey is a status the
// world does not interpret.
function IssueMarker({
  entity,
  position,
  scale,
  selected,
  highlighted,
  onSelect,
}: {
  entity: WorldEntity;
  position: [number, number, number];
  scale: number;
  selected: boolean;
  highlighted: boolean;
  onSelect: (issue: WorldEntity) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const visualState = typeof entity.metadata.visualState === "string"
    ? entity.metadata.visualState as IssueVisualState
    : "unknown";
  const color = issueStateColor(visualState);
  return (
    <group
      position={position}
      scale={scale * (selected ? 1.22 : hovered ? 1.1 : 1)}
      onPointerOver={(event) => { event.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
      onClick={(event) => { event.stopPropagation(); onSelect(entity); }}
    >
      {/* Hit target matched to the cone's own silhouette. An oversized box would
          sit in front of the cones behind it and swallow their hover. */}
      <mesh position={[0, .24, 0]}>
        <boxGeometry args={[.34, .48, .34]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {/* Flat square base */}
      <mesh castShadow receiveShadow position={[0, .022, 0]}>
        <boxGeometry args={[.34, .044, .34]} />
        <meshStandardMaterial color={selected ? "#e9f1a8" : "#2e3438"} roughness={.85} />
      </mesh>
      {/* Cone body with the two reflective collars a site cone carries */}
      <mesh castShadow position={[0, .26, 0]}>
        <coneGeometry args={[.15, .44, 14]} />
        <meshStandardMaterial color={color} roughness={.68} />
      </mesh>
      <mesh position={[0, .27, 0]}>
        <coneGeometry args={[.116, .09, 14]} />
        <meshStandardMaterial color="#f4f6f5" roughness={.55} />
      </mesh>
      <mesh position={[0, .38, 0]}>
        <coneGeometry args={[.076, .07, 14]} />
        <meshStandardMaterial color="#f4f6f5" roughness={.55} />
      </mesh>
      {highlighted && <HighlightRing y={.024} radius={.34} />}
      {selected && <SelectionRing color="#d8ef78" y={.03} />}
      {/* An overdue issue burns where it stands, so a yard in trouble is
          readable from the overview zoom without opening anything. */}
      <OverdueSmoke entity={entity} y={.4} />
      <DueDateHealthBar entity={entity} y={.68} detailed={selected || hovered} />
      {(selected || hovered) && (
        <Html position={[0, 1.04, 0]} center zIndexRange={[1, 0]} style={{ pointerEvents: "none" }}>
          <div className="asset-world-label issue-world-label">{entity.title}</div>
        </Html>
      )}
    </group>
  );
}

function PeopleEntities({
  entities,
  center,
  size,
  issueCenter,
  issueSize,
  travelObstacles,
  workerActivity,
  selectedPersonId,
  highlightedIds,
  onSelect,
}: {
  entities: WorldEntity[];
  center: [number, number, number];
  size: [number, number];
  issueCenter: [number, number, number];
  issueSize: [number, number];
  travelObstacles: PositionedZone[];
  workerActivity: Map<string, IssueActivityEvent>;
  selectedPersonId?: string;
  highlightedIds?: Set<string>;
  onSelect: (person: WorldEntity) => void;
}) {
  const peopleLayout = layoutPeople(entities.length, size);
  const activeWorkerIds = entities.filter((entity) => workerActivity.has(entity.id)).map((entity) => entity.id);
  return <>{entities.map((entity, index) => {
    const offset = peopleLayout.offsets[index];
    const position: [number, number, number] = [center[0] + offset[0], 0, center[2] + offset[1]];
    const workerSlot = Math.max(0, activeWorkerIds.indexOf(entity.id));
    const candidateWorkTarget: [number, number, number] = [
      issueCenter[0] + (workerSlot - (activeWorkerIds.length - 1) / 2) * .48,
      0,
      issueCenter[2] + issueSize[1] / 2 - .42,
    ];
    const workTarget = travelObstacles.some((zone) => segmentIntersectsZone(position, candidateWorkTarget, zone))
      ? undefined
      : candidateWorkTarget;
    return (
      <PersonNpc
        key={entity.id}
        entity={entity}
        position={position}
        index={index}
        workTarget={workTarget}
        activityEvent={workerActivity.get(entity.id)}
        selected={selectedPersonId === entity.id}
        highlighted={highlightedIds?.has(entity.id) ?? false}
        onSelect={onSelect}
      />
    );
  })}</>;
}

// One real project member, one crew figure. Every visual trait comes from
// `personAppearance`, which is keyed on the Autodesk account id (or email) —
// never on the project membership record — so the same person is recognisably
// the same crew member in every project world.
function PersonNpc({
  entity,
  position,
  index,
  workTarget,
  activityEvent,
  selected,
  highlighted,
  onSelect,
}: {
  entity: WorldEntity;
  position: [number, number, number];
  index: number;
  workTarget?: [number, number, number];
  activityEvent?: IssueActivityEvent;
  selected: boolean;
  highlighted: boolean;
  onSelect: (person: WorldEntity) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const animated = useRef<Group>(null);
  const traveler = useRef<Group>(null);
  const leftArm = useRef<Group>(null);
  const rightArm = useRef<Group>(null);
  const look = useMemo(() => personAppearance(entity), [entity]);
  const { idle, build } = look;
  const shoulders = [.30, .34, .27][build];
  const height = [.62, .68, .58][build];
  useFrame(({ clock }) => {
    if (traveler.current) {
      const elapsed = activityEvent && workTarget ? (Date.now() - activityEvent.observedAt) / 1000 : 99;
      const rawProgress = elapsed < 5 ? elapsed / 5 : elapsed < 13 ? 1 : elapsed < 19 ? 1 - (elapsed - 13) / 6 : 0;
      const progress = MathUtils.smoothstep(MathUtils.clamp(rawProgress, 0, 1), 0, 1);
      traveler.current.position.x = workTarget ? (workTarget[0] - position[0]) * progress : 0;
      traveler.current.position.z = workTarget ? (workTarget[2] - position[2]) * progress : 0;
      traveler.current.rotation.y = progress > 0 && progress < 1
        ? Math.atan2(workTarget![0] - position[0], workTarget![2] - position[2])
        : 0;
    }
    if (!animated.current) return;
    const time = clock.getElapsedTime() + index * .73;
    if (idle === 0) {
      const previousX = animated.current.position.x;
      const previousZ = animated.current.position.z;
      const nextX = Math.sin(time * .52) * .26;
      const nextZ = Math.sin(time * .31 + 1.4) * .2;
      animated.current.position.x = nextX;
      animated.current.position.z = nextZ;
      animated.current.position.y = Math.abs(Math.sin(time * 3.6)) * .018;
      animated.current.rotation.y = Math.atan2(nextX - previousX, nextZ - previousZ);
    } else if (idle === 1) {
      animated.current.position.y = Math.sin(time * 2.2) * .012;
      animated.current.rotation.z = Math.sin(time * 1.5) * .035;
    } else {
      animated.current.position.x = Math.sin(time * .65) * .08;
      animated.current.position.y = Math.abs(Math.sin(time * 2.4)) * .01;
      animated.current.rotation.y = Math.sin(time * .45) * .18;
    }
    const armMotion = idle === 1 ? Math.sin(time * 4.2) * .28 : Math.sin(time * 3.2) * .42;
    if (leftArm.current) leftArm.current.rotation.x = armMotion;
    if (rightArm.current) rightArm.current.rotation.x = -armMotion;
  });
  return (
    <group
      position={position}
      scale={selected ? 1.16 : hovered ? 1.08 : 1}
      onPointerOver={(event) => { event.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
      onClick={(event) => { event.stopPropagation(); onSelect(entity); }}
    >
      <group ref={traveler}>
      <group ref={animated}>
        {/* Whole-figure click target, kept to the figure's own width so a front
            row cannot swallow the hover of the row behind it. */}
        <mesh position={[0, .5, 0]}>
          <boxGeometry args={[.34, 1.0, .3]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        <mesh position={[0, .004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[.22, 18]} />
          <meshBasicMaterial color="#1b2a24" transparent opacity={.2} depthWrite={false} />
        </mesh>
        {/* Boots and work trousers */}
        {[-.06, .06].map((x) => (
          <group key={x}>
            <mesh castShadow position={[x, .12, 0]}><boxGeometry args={[.08, .24, .085]} /><meshStandardMaterial color={look.trousers} roughness={.92} /></mesh>
            <mesh castShadow position={[x, .028, .016]}><boxGeometry args={[.09, .055, .14]} /><meshStandardMaterial color="#3a3129" roughness={.9} /></mesh>
          </group>
        ))}
        {/* Boxy torso in sleeves, with the hi-vis vest as a separate shell */}
        <mesh castShadow position={[0, .24 + height / 2, 0]}>
          <boxGeometry args={[shoulders, height, .19]} />
          <meshStandardMaterial color={look.sleeves} roughness={.86} />
        </mesh>
        <mesh castShadow position={[0, .24 + height / 2 - .02, 0]}>
          <boxGeometry args={[shoulders * .74, height * .78, .215]} />
          <meshStandardMaterial color={look.vest} roughness={.72} />
        </mesh>
        {/* Reflective bands make the vest read at a distance */}
        {[-.1, .08].map((offset) => (
          <mesh key={offset} position={[0, .24 + height / 2 + offset, .11]}>
            <boxGeometry args={[shoulders * .74, .035, .015]} />
            <meshStandardMaterial color="#eef2f4" roughness={.4} />
          </mesh>
        ))}
        <group ref={leftArm} position={[-shoulders / 2 - .028, .24 + height - .07, 0]} rotation={[0, 0, idle === 1 ? -.55 : -.16]}>
          <mesh castShadow position={[0, -.11, 0]}><boxGeometry args={[.06, .24, .07]} /><meshStandardMaterial color={look.sleeves} roughness={.86} /></mesh>
          <mesh position={[0, -.25, 0]}><boxGeometry args={[.062, .06, .072]} /><meshStandardMaterial color={look.skin} roughness={.9} /></mesh>
        </group>
        <group ref={rightArm} position={[shoulders / 2 + .028, .24 + height - .07, 0]} rotation={[0, 0, idle === 1 ? .55 : .16]}>
          <mesh castShadow position={[0, -.11, 0]}><boxGeometry args={[.06, .24, .07]} /><meshStandardMaterial color={look.sleeves} roughness={.86} /></mesh>
          <mesh position={[0, -.25, 0]}><boxGeometry args={[.062, .06, .072]} /><meshStandardMaterial color={look.skin} roughness={.9} /></mesh>
        </group>
        {/* Head and the hard hat every crew member wears on site */}
        <mesh castShadow position={[0, .3 + height + .1, 0]}><boxGeometry args={[.15, .17, .15]} /><meshStandardMaterial color={look.skin} roughness={.9} /></mesh>
        <group position={[0, .3 + height + .21, 0]}>
          <mesh castShadow position={[0, .022, 0]}><cylinderGeometry args={[.085, .098, .085, 10]} /><meshStandardMaterial color={look.helmet} roughness={.55} /></mesh>
          <mesh position={[0, .062, 0]}><boxGeometry args={[.03, .022, .17]} /><meshStandardMaterial color={look.helmet} roughness={.55} /></mesh>
          <mesh castShadow position={[0, -.024, .012]}><cylinderGeometry args={[.125, .125, .022, 12]} /><meshStandardMaterial color={look.helmet} roughness={.6} /></mesh>
        </group>
        {/* Deterministic carried tool keeps the camp from reading as a clone army */}
        {idle === 1 && (
          <mesh castShadow position={[0, .3 + height * .55, -.16]} rotation={[-.3, 0, 0]}>
            <boxGeometry args={[.22, .16, .03]} />
            <meshStandardMaterial color="#e3e7e2" roughness={.9} />
          </mesh>
        )}
        {idle === 2 && (
          <mesh castShadow position={[.21, .3 + height * .45, -.04]} rotation={[0, 0, -.18]}>
            <boxGeometry args={[.15, .2, .12]} />
            <meshStandardMaterial color="#a97f4f" roughness={.94} />
          </mesh>
        )}
        {highlighted && <HighlightRing y={.014} radius={.36} />}
        {selected && <SelectionRing color="#d8ef78" y={.02} />}
        {(selected || hovered) && (
          <Html position={[0, 1.32, 0]} center zIndexRange={[1, 0]} style={{ pointerEvents: "none" }}>
            <div className="entity-label person-label">{entity.title}</div>
          </Html>
        )}
      </group>
      </group>
    </group>
  );
}

function hashText(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function DocumentEntities({
  entities,
  center,
  size,
  selectedDocumentId,
  onSelect,
}: {
  entities: WorldEntity[];
  center: [number, number, number];
  size: [number, number];
  selectedDocumentId?: string;
  onSelect: (document: WorldEntity) => void;
}) {
  const columns = Math.min(Math.max(1, Math.floor((size[0] - 1.2) / .62)), Math.max(1, Math.ceil(Math.sqrt(entities.length))));
  const rows = Math.max(1, Math.ceil(entities.length / columns));
  return <>{entities.map((entity, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    return (
      <DocumentNode
        key={entity.id}
        entity={entity}
        position={[
          center[0] + (column - (columns - 1) / 2) * .62,
          0,
          center[2] + .95 + (row - (rows - 1) / 2) * .58,
        ]}
        selected={selectedDocumentId === entity.id}
        onSelect={onSelect}
      />
    );
  })}</>;
}

function DocumentNode({
  entity,
  position,
  selected,
  onSelect,
}: {
  entity: WorldEntity;
  position: [number, number, number];
  selected: boolean;
  onSelect: (document: WorldEntity) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const isFolder = entity.metadata.isFolder === true;
  return (
    <group
      position={position}
      scale={selected ? 1.15 : hovered ? 1.07 : 1}
      onPointerOver={(event) => { event.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
      onClick={(event) => { event.stopPropagation(); onSelect(entity); }}
    >
      <mesh position={[0, .3, 0]}>
        <boxGeometry args={[.42, .6, .4]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {isFolder ? (
        <>
          {/* Archive folder: body, open lid, peeking papers and a tab */}
          <mesh castShadow position={[0, .21, 0]}><boxGeometry args={[.46, .3, .36]} /><meshStandardMaterial color={selected ? "#eec95f" : "#c9973f"} roughness={.88} /></mesh>
          <mesh castShadow position={[0, .4, -.14]} rotation={[-.55, 0, 0]}><boxGeometry args={[.46, .28, .035]} /><meshStandardMaterial color={selected ? "#f6dc86" : "#dcae55"} roughness={.88} /></mesh>
          <mesh position={[0, .27, .185]}><boxGeometry args={[.32, .16, .012]} /><meshStandardMaterial color="#fbf6ea" roughness={.9} /></mesh>
          <mesh position={[.02, .22, .19]}><boxGeometry args={[.24, .03, .01]} /><meshStandardMaterial color="#b9a98c" /></mesh>
          <mesh castShadow position={[-.11, .385, .06]}><boxGeometry args={[.15, .08, .2]} /><meshStandardMaterial color="#e0ba66" roughness={.88} /></mesh>
        </>
      ) : (
        <group rotation={[0, .16, 0]}>
          {/* Standing drawing set: sheets with a coloured project spine */}
          <mesh castShadow position={[0, .31, 0]}><boxGeometry args={[.34, .52, .08]} /><meshStandardMaterial color={selected ? "#dbeff8" : "#f2f4ee"} roughness={.92} /></mesh>
          <mesh position={[0, .46, .045]}><boxGeometry args={[.2, .05, .012]} /><meshStandardMaterial color="#4f7fa0" /></mesh>
          <mesh position={[0, .36, .045]}><boxGeometry args={[.22, .026, .012]} /><meshStandardMaterial color="#9db1bc" /></mesh>
          <mesh position={[0, .27, .045]}><boxGeometry args={[.18, .026, .012]} /><meshStandardMaterial color="#9db1bc" /></mesh>
          <mesh position={[0, .17, .045]}><boxGeometry args={[.21, .05, .012]} /><meshStandardMaterial color="#c8d6dd" /></mesh>
          <mesh position={[-.155, .31, 0]}><boxGeometry args={[.032, .52, .055]} /><meshStandardMaterial color="#3d638c" /></mesh>
        </group>
      )}
      {selected && <SelectionRing color="#d8ef78" y={.02} />}
      {(selected || hovered) && (
        <Html position={[0, .92, 0]} center zIndexRange={[1, 0]} style={{ pointerEvents: "none" }}>
          <div className="entity-label document-label">{entity.title}</div>
        </Html>
      )}
    </group>
  );
}

// One real RFI is one notice board standing in the RFI district: an open
// question posted on site. The header band carries the record's APS status.
function RfiEntities({
  entities,
  center,
  size,
  selectedRfiId,
  highlightedIds,
  onSelect,
}: {
  entities: WorldEntity[];
  center: [number, number, number];
  size: [number, number];
  selectedRfiId?: string;
  highlightedIds?: Set<string>;
  onSelect: (rfi: WorldEntity) => void;
}) {
  const columns = Math.min(Math.max(1, Math.floor((size[0] - 1.6) / .72)), Math.max(1, Math.ceil(Math.sqrt(entities.length))));
  const rows = Math.max(1, Math.ceil(entities.length / columns));
  return <>{entities.map((entity, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    return (
      <RfiBoard
        key={entity.id}
        entity={entity}
        position={[
          center[0] + (column - (columns - 1) / 2) * .72,
          0,
          center[2] + 1.0 + (row - (rows - 1) / 2) * .64,
        ]}
        selected={selectedRfiId === entity.id}
        highlighted={highlightedIds?.has(entity.id) ?? false}
        onSelect={onSelect}
      />
    );
  })}</>;
}

export function rfiStatusColor(status: string | undefined): string {
  const normalized = status?.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["closed", "answered", "completed", "void", "rejected"].includes(normalized ?? "")) return "#3faa5f";
  if (["open", "submitted", "in_review", "draft", "pending_review"].includes(normalized ?? "")) return "#e8b32c";
  return "#8d9499";
}

function RfiBoard({
  entity,
  position,
  selected,
  highlighted,
  onSelect,
}: {
  entity: WorldEntity;
  position: [number, number, number];
  selected: boolean;
  highlighted: boolean;
  onSelect: (rfi: WorldEntity) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const color = rfiStatusColor(entity.status);
  return (
    <group
      position={position}
      scale={selected ? 1.16 : hovered ? 1.08 : 1}
      onPointerOver={(event) => { event.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
      onClick={(event) => { event.stopPropagation(); onSelect(entity); }}
    >
      <mesh position={[0, .3, 0]}>
        <boxGeometry args={[.46, .6, .3]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {[-.16, .16].map((x) => (
        <mesh key={x} castShadow position={[x, .16, 0]}>
          <cylinderGeometry args={[.022, .028, .32, 6]} />
          <meshStandardMaterial color={STEEL} roughness={.5} metalness={.4} />
        </mesh>
      ))}
      {/* Posted sheet with a status header band */}
      <mesh castShadow position={[0, .42, 0]} rotation={[-.16, 0, 0]}>
        <boxGeometry args={[.42, .34, .03]} />
        <meshStandardMaterial color={selected ? "#e9f1a8" : PANEL} roughness={.9} />
      </mesh>
      <mesh position={[0, .53, .022]} rotation={[-.16, 0, 0]}>
        <boxGeometry args={[.42, .09, .012]} />
        <meshStandardMaterial color={color} roughness={.7} />
      </mesh>
      {[.02, -.04].map((y) => (
        <mesh key={y} position={[0, .42 + y, .022]} rotation={[-.16, 0, 0]}>
          <boxGeometry args={[.3, .022, .01]} />
          <meshStandardMaterial color="#9aa8ae" roughness={.9} />
        </mesh>
      ))}
      {highlighted && <HighlightRing y={.014} radius={.34} />}
      {selected && <SelectionRing color="#d8ef78" y={.02} />}
      <OverdueSmoke entity={entity} y={.62} />
      <DueDateHealthBar entity={entity} y={.82} detailed={selected || hovered} />
      {(selected || hovered) && (
        <Html position={[0, 1.16, 0]} center zIndexRange={[1, 0]} style={{ pointerEvents: "none" }}>
          <div className="entity-label rfi-label">{entity.title}</div>
        </Html>
      )}
    </group>
  );
}

function FormEntities({
  entities,
  center,
  size,
  selectedFormId,
  highlightedIds,
  onSelect,
}: {
  entities: WorldEntity[];
  center: [number, number, number];
  size: [number, number];
  selectedFormId?: string;
  highlightedIds?: Set<string>;
  onSelect: (form: WorldEntity) => void;
}) {
  const columns = Math.min(Math.max(1, Math.floor((size[0] - 1.2) / .58)), Math.max(1, Math.ceil(Math.sqrt(entities.length))));
  const rows = Math.max(1, Math.ceil(entities.length / columns));
  return <>{entities.map((entity, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    return (
      <FormCheckpoint
        key={entity.id}
        entity={entity}
        position={[
          center[0] + (column - (columns - 1) / 2) * .58,
          0,
          center[2] + .9 + (row - (rows - 1) / 2) * .56,
        ]}
        selected={selectedFormId === entity.id}
        highlighted={highlightedIds?.has(entity.id) ?? false}
        onSelect={onSelect}
      />
    );
  })}</>;
}

function formStatusColor(status: string | undefined): string {
  const normalized = status?.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["closed", "completed", "submitted", "approved"].includes(normalized ?? "")) return "#4d876b";
  if (["open", "in_progress", "active"].includes(normalized ?? "")) return "#c6873c";
  return "#755990";
}

function FormCheckpoint({
  entity,
  position,
  selected,
  highlighted,
  onSelect,
}: {
  entity: WorldEntity;
  position: [number, number, number];
  selected: boolean;
  highlighted: boolean;
  onSelect: (form: WorldEntity) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const color = formStatusColor(entity.status);
  return (
    <group
      position={position}
      scale={selected ? 1.15 : hovered ? 1.07 : 1}
      onPointerOver={(event) => { event.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
      onClick={(event) => { event.stopPropagation(); onSelect(entity); }}
    >
      <mesh position={[0, .45, 0]}>
        <boxGeometry args={[.42, .9, .42]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {/* Checkpoint totem: tall post, tilted clipboard, status band and pennant */}
      <mesh castShadow position={[0, .31, 0]}><cylinderGeometry args={[.035, .05, .62, 8]} /><meshStandardMaterial color="#2c4139" roughness={.85} /></mesh>
      <mesh castShadow position={[0, .6, 0]} rotation={[-.12, 0, 0]}><boxGeometry args={[.36, .52, .06]} /><meshStandardMaterial color="#f4f3ed" roughness={.92} /></mesh>
      <mesh castShadow position={[0, .84, .012]} rotation={[-.12, 0, 0]}><boxGeometry args={[.14, .06, .05]} /><meshStandardMaterial color="#8f9aa2" metalness={.45} roughness={.45} /></mesh>
      <mesh position={[0, .7, .034]} rotation={[-.12, 0, 0]}><boxGeometry args={[.24, .09, .014]} /><meshStandardMaterial color={color} /></mesh>
      {[-.02, .08, .18].map((y) => <mesh key={y} position={[.03, .5 + y, .034]} rotation={[-.12, 0, 0]}><boxGeometry args={[.16, .018, .012]} /><meshStandardMaterial color="#8ca098" /></mesh>)}
      <group position={[0, .88, 0]}>
        <mesh castShadow position={[0, .04, 0]}><cylinderGeometry args={[.01, .01, .14, 6]} /><meshStandardMaterial color="#2c4139" /></mesh>
        <mesh castShadow position={[.08, .1, 0]} rotation={[0, 0, -.12]}><boxGeometry args={[.13, .07, .018]} /><meshStandardMaterial color={color} /></mesh>
      </group>
      {/* Gravel footing keeps the totem standing on the ground, not on a plate */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, .016, 0]}>
        <circleGeometry args={[.26, 16]} />
        <meshStandardMaterial color="#8f7a5c" roughness={1} />
      </mesh>
      {highlighted && <HighlightRing y={.018} radius={.32} />}
      {selected && <SelectionRing color="#d8ef78" y={.024} />}
      {(selected || hovered) && (
        <Html position={[0, 1.02, 0]} center zIndexRange={[1, 0]} style={{ pointerEvents: "none" }}>
          <div className="entity-label form-label">{entity.title}</div>
        </Html>
      )}
    </group>
  );
}

type EntityDetailProps = {
  entity: WorldEntity;
  projectName: string;
  actionSection?: ReactNode;
  relationshipSection?: ReactNode;
  onClose: () => void;
};

function CreateIssueAction({ onClick }: { onClick: () => void }) {
  return (
    <section className="entity-actions">
      <button type="button" onClick={onClick}><span>+</span>Create issue</button>
      <small>Creates a real non-placement issue after confirmation.</small>
    </section>
  );
}

function WorldActionSection({ entity, onCompleted }: { entity: WorldEntity; onCompleted: (entity: WorldEntity) => Promise<void> }) {
  const [options, setOptions] = useState<WorldActionOptions>();
  const [capability, setCapability] = useState<WorldActionCapability>();
  const [value, setValue] = useState("");
  const [step, setStep] = useState<"choose" | "confirm" | "sending" | "success">("choose");
  const [error, setError] = useState<string>();
  const [requiresReauthentication, setRequiresReauthentication] = useState(false);

  useEffect(() => {
    let active = true;
    fetchWorldActionOptions(entity)
      .then((result) => {
        if (!active) return;
        setOptions(result);
        const first = result.capabilities[0];
        setCapability(first);
        setValue(first?.options[0]?.value ?? "");
      })
      .catch((cause: unknown) => {
        if (active) setOptions({ state: "error", entityType: entity.type, entityId: entity.externalId, writeScopeGranted: false, capabilities: [], error: cause instanceof Error ? cause.message : "World actions could not be loaded." });
      });
    return () => { active = false; };
  }, [entity]);

  if (!options) return <section className="world-action-card loading"><span>FORMA ACTION</span><p>Checking live permissions…</p></section>;
  if (!capability) return (
    <section className="world-action-card unavailable">
      <span>FORMA ACTION</span>
      <p>{options.error ?? "No workflow action is available for this record."}</p>
      {!options.writeScopeGranted && <a href="/api/auth/login">Sign in again with write access</a>}
    </section>
  );
  const selectedOption = capability.options.find((option) => option.value === value);
  const submit = async () => {
    setStep("sending");
    setError(undefined);
    setRequiresReauthentication(false);
    try {
      const result = await executeWorldAction({
        entityType: entity.type as "asset" | "issue" | "form",
        entityId: entity.externalId,
        kind: capability.kind,
        value,
      }, entity.projectId);
      await onCompleted(result.entity);
      setStep("success");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "APS did not complete the action.");
      setRequiresReauthentication(Boolean(cause && typeof cause === "object" && "requiresReauthentication" in cause && cause.requiresReauthentication));
      setStep("confirm");
    }
  };
  return (
    <section className={`world-action-card step-${step}`}>
      <span>FORMA WRITE-BACK</span>
      <strong>{capability.label}</strong>
      {step === "success" ? (
        <div className="world-action-success"><i>✓</i><p>APS confirmed the update. The world has been reconciled.</p></div>
      ) : step === "confirm" || step === "sending" ? (
        <div className="world-action-confirm">
          <p>This changes the real Autodesk project record.</p>
          <dl><div><dt>Record</dt><dd>{entity.title}</dd></div><div><dt>From</dt><dd>{capability.currentValue ?? "Not set"}</dd></div><div><dt>To</dt><dd>{selectedOption?.label ?? value}</dd></div></dl>
          {error && <div className="world-action-error"><b>APS rejected the update</b><small>{error}</small>{requiresReauthentication && <a href="/api/auth/login">Sign in again</a>}</div>}
          <div className="world-action-buttons"><button type="button" onClick={() => setStep("choose")} disabled={step === "sending"}>Back</button><button className="confirm" type="button" onClick={submit} disabled={step === "sending"}>{step === "sending" ? "Waiting for APS…" : "Confirm in Forma"}</button></div>
        </div>
      ) : (
        <div className="world-action-choose">
          <p>{capability.description}</p>
          <label>{capability.fieldLabel}<select value={value} onChange={(event) => setValue(event.target.value)}>{capability.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <button type="button" onClick={() => setStep("confirm")} disabled={!value}>Review change</button>
        </div>
      )}
    </section>
  );
}

function assignablePersonId(entity: WorldEntity): string {
  const raw = entity.metadata.raw && typeof entity.metadata.raw === "object"
    ? entity.metadata.raw as Record<string, unknown>
    : {};
  return typeof raw.autodeskId === "string" && raw.autodeskId ? raw.autodeskId : entity.externalId;
}

/**
 * `context` is the record the issue was raised from. It is optional because the
 * same composer is opened from the global tool bar, where nothing is selected —
 * a second, cut-down "placeholder" dialog for that case would have been a
 * downgrade, since this one already writes a real issue to APS.
 */
function IssueComposer({
  context,
  people,
  onClose,
  onCreated,
}: {
  context?: WorldEntity;
  people: WorldEntity[];
  onClose: () => void;
  onCreated: (issue: WorldEntity) => Promise<void>;
}) {
  // Subtypes are per project, so the composer works in the project of the
  // record it was opened on. Opened from the tool bar with no record, it works
  // in the primary project, which is what the server assumes for a bare request.
  const composerProjectId = context?.projectId;
  const [options, setOptions] = useState<IssueCreateOptions>();
  const [step, setStep] = useState<"edit" | "confirm" | "sending" | "success">("edit");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [issueSubtypeId, setIssueSubtypeId] = useState("");
  const [assignedTo, setAssignedTo] = useState(context?.type === "person" ? assignablePersonId(context) : "");
  const [error, setError] = useState<string>();
  const [requiresReauthentication, setRequiresReauthentication] = useState(false);
  const [createdIssue, setCreatedIssue] = useState<WorldEntity>();

  useEffect(() => {
    let active = true;
    fetchIssueCreateOptions(composerProjectId)
      .then((result) => {
        if (!active) return;
        setOptions(result);
        if (result.subtypes[0]) setIssueSubtypeId(result.subtypes[0].id);
      })
      .catch((cause: unknown) => {
        if (active) setOptions({ state: "error", subtypes: [], writeScopeGranted: false, error: cause instanceof Error ? cause.message : "Issue settings could not be loaded." });
      });
    return () => { active = false; };
  }, [composerProjectId]);

  const subtype = options?.subtypes.find((candidate) => candidate.id === issueSubtypeId);
  const assignee = people.find((person) => assignablePersonId(person) === assignedTo);
  const canReview = Boolean(title.trim() && issueSubtypeId && options?.state === "available" && options.writeScopeGranted);

  const create = async () => {
    setStep("sending");
    setError(undefined);
    setRequiresReauthentication(false);
    try {
      const result = await postIssue({
        title: title.trim(),
        description: description.trim() || undefined,
        issueSubtypeId,
        assignedTo: assignedTo || undefined,
        assignedToType: assignedTo ? "user" : undefined,
      }, composerProjectId);
      setCreatedIssue(result.issue);
      await onCreated(result.issue);
      setStep("success");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "APS did not create the issue.");
      setRequiresReauthentication(Boolean(cause && typeof cause === "object" && "requiresReauthentication" in cause && cause.requiresReauthentication));
      setStep("confirm");
    }
  };

  return (
    <div className="issue-compose-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && step !== "sending") onClose(); }}>
      <section className="issue-composer" role="dialog" aria-modal="true" aria-labelledby="issue-composer-title">
        <button className="composer-close" type="button" onClick={onClose} disabled={step === "sending"} aria-label="Close issue composer">×</button>
        <span className="composer-kicker">FORMA WRITE-BACK</span>
        <h2 id="issue-composer-title">{step === "success" ? "Issue created" : step === "confirm" || step === "sending" ? "Confirm issue" : "Create issue"}</h2>

        {step === "success" && createdIssue ? (
          <div className="composer-success">
            <i>✓</i>
            <p>APS confirmed the issue and the Issues district has been reconciled.</p>
            <strong>{createdIssue.title}</strong>
            <small>APS ID · {createdIssue.externalId}</small>
            <button className="composer-primary" type="button" onClick={onClose}>View in Issues</button>
          </div>
        ) : step === "confirm" || step === "sending" ? (
          <div className="composer-confirm">
            <p>This will create a real non-placement issue in Autodesk Forma.</p>
            <dl>
              <div><dt>Title</dt><dd>{title}</dd></div>
              <div><dt>Type</dt><dd>{subtype ? [subtype.parentTitle, subtype.title].filter(Boolean).join(" / ") : issueSubtypeId}</dd></div>
              <div><dt>Status</dt><dd>Open</dd></div>
              <div><dt>Assignee</dt><dd>{assignee?.title ?? "Unassigned"}</dd></div>
              {context && <div><dt>Context</dt><dd>{context.title} · {context.type}</dd></div>}
            </dl>
            {context?.type === "asset" && <small className="composer-note">The asset is creation context only. Phase 8 does not write an unverified asset reference.</small>}
            {error && <div className="composer-error"><strong>APS rejected the request</strong><span>{error}</span>{requiresReauthentication && <a href="/api/auth/login">Sign in again with write access</a>}</div>}
            <div className="composer-actions">
              <button type="button" onClick={() => setStep("edit")} disabled={step === "sending"}>Back</button>
              <button className="composer-primary danger" type="button" onClick={create} disabled={step === "sending"}>{step === "sending" ? "Waiting for APS…" : "Confirm & create in Forma"}</button>
            </div>
          </div>
        ) : (
          <form className="composer-form" onSubmit={(event) => { event.preventDefault(); if (canReview) setStep("confirm"); }}>
            {context && <div className="composer-context"><i>{context.type.slice(0, 1).toUpperCase()}</i><span><small>SELECTED {context.type.toUpperCase()}</small><strong>{context.title}</strong></span></div>}
            <label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} required autoFocus placeholder="What needs attention?" /></label>
            <label>Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={5000} rows={4} placeholder="Add the project context and expected resolution." /></label>
            <label>Issue type<select value={issueSubtypeId} onChange={(event) => setIssueSubtypeId(event.target.value)} disabled={!options || options.state !== "available"} required>
              {!options && <option>Loading project issue types…</option>}
              {options?.subtypes.map((option) => <option key={option.id} value={option.id}>{[option.parentTitle, option.title].filter(Boolean).join(" / ")}</option>)}
            </select></label>
            <label>Assignee<select value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)}><option value="">Unassigned</option>{people.map((person) => <option key={person.id} value={assignablePersonId(person)}>{person.title}</option>)}</select></label>
            {options && options.state !== "available" && <div className="composer-error"><strong>Issue types unavailable</strong><span>{options.error ?? "This project returned no usable issue subtypes."}</span></div>}
            {options && !options.writeScopeGranted && <div className="composer-error"><strong>Write access requires a new sign-in</strong><span>Your current session was authorized before FormaWorld requested the APS data:write scope.</span><a href="/api/auth/login">Sign in again with write access</a></div>}
            <small className="composer-note">Nothing is sent to APS until you review and confirm the next step.</small>
            <div className="composer-actions"><button type="button" onClick={onClose}>Cancel</button><button className="composer-primary" type="submit" disabled={!canReview}>Review issue</button></div>
          </form>
        )}
      </section>
    </div>
  );
}

/** How many records one district panel lists before it says how many remain. */
const ZONE_LIST_LIMIT = 24;

function ZoneDetail({
  zone,
  entities,
  assetStatuses,
  assetCategories,
  reveal,
  total,
  projectName,
  projectId,
  onLocate,
  onClose,
}: {
  zone: WorldZone;
  entities: WorldEntity[];
  assetStatuses: AssetStatusOption[];
  assetCategories: AssetCategoryOption[];
  /** A digest line asking the panel to show only the records it is about. */
  reveal?: { headline: string; ids: Set<string>; onClear: () => void };
  total: number;
  projectName: string;
  projectId: string;
  onLocate: (entity: WorldEntity) => void;
  onClose: () => void;
}) {
  // A revealed digest line narrows the list to the records it named. Anything
  // else in the district is still on the ground; it is just not what was asked
  // about, and leaving it in the list would bury the answer.
  const listed = reveal ? entities.filter((entity) => reveal.ids.has(entity.id)) : entities;
  // The panel groups records the way the world lays them out, so a status in
  // this list points at a lane or a bay the reader can actually find.
  const groups = groupDistrictEntities(listed, zone.kind, assetStatuses);
  const flat = isUngrouped(groups);
  // The display limit is shared across groups, so it is applied once up front
  // rather than by mutating a counter while rendering.
  const visibleGroups = groups.reduce<{ groups: Array<{ key: string; label: string; total: number; visible: WorldEntity[] }>; shown: number }>(
    (result, group) => {
      const visible = group.entities.slice(0, Math.max(0, ZONE_LIST_LIMIT - result.shown));
      return {
        groups: visible.length > 0
          ? [...result.groups, { key: group.key, label: group.label, total: group.entities.length, visible }]
          : result.groups,
        shown: result.shown + visible.length,
      };
    },
    { groups: [], shown: 0 },
  );
  return (
    <aside className="world-detail zone-detail" aria-live="polite">
      <button className="detail-close" type="button" onClick={onClose} aria-label="Close district contents">×</button>
      <span className="detail-kicker">LIVE DISTRICT CONTENTS</span>
      <div className="detail-color" style={{ background: zone.color }} />
      <h2>{zone.label}</h2>
      <p>{zone.description}</p>
      <div className="zone-content-summary">
        <strong>{total}</strong>
        <span>{total === 1 ? "project record" : "project records"}</span>
        {total > entities.length && <small>Showing {entities.length} loaded representatives</small>}
      </div>
      {reveal && (
        <div className="zone-reveal">
          <span><b>Showing</b>{reveal.headline}</span>
          <button type="button" onClick={reveal.onClear}>Show all {entities.length}</button>
        </div>
      )}
      {!flat && groups.length > 0 && (
        <div className="zone-content-types">
          {groups.map((group) => <span key={group.key}><b>{group.entities.length}</b>{group.label}</span>)}
        </div>
      )}
      <section className="zone-content-list" aria-label={`${zone.label} records`}>
        <header><span>{reveal ? "FROM THE DIGEST" : "IN THIS DISTRICT"}</span><b>{listed.length}</b></header>
        {listed.length === 0 && (
          <p>{reveal
            ? "Those records are no longer loaded in this district."
            : "No live records are currently represented here."}</p>
        )}
        {visibleGroups.groups.map((group) => (
            <div key={group.key} className="zone-content-group">
              {!flat && (
                <h3>
                  <span>{group.label}</span>
                  <b>{group.total}</b>
                </h3>
              )}
              {group.visible.map((entity) => (
                <button key={entity.id} type="button" onClick={() => onLocate(entity)}>
                  <i className={`entity-glyph type-${entity.type}`}>
                    <EntityIcon
                      entity={entity}
                      assetCategories={assetCategories}
                      rfiColor={rfiStatusColor}
                      formColor={formStatusColor}
                    />
                  </i>
                  <span><strong>{entity.title}</strong><small>{entity.status ?? entity.type}</small></span>
                  <em>Inspect</em>
                </button>
              ))}
            </div>
        ))}
        {listed.length > visibleGroups.shown && (
          <p className="zone-content-more">{listed.length - visibleGroups.shown} more in this district</p>
        )}
      </section>
      <dl>
        <div><dt>Project</dt><dd>{projectName}</dd></div>
        <div><dt>Footprint</dt><dd>{zone.size[0].toFixed(1)} × {zone.size[1].toFixed(1)} tiles</dd></div>
      </dl>
      <details className="world-technical"><summary>Technical details</summary><small>Project ID · {projectId}</small></details>
    </aside>
  );
}

function RelationshipSection({
  related,
  assetCategories,
  onLocate,
  onLocateAll,
}: {
  related: ReturnType<typeof relatedEntities>;
  assetCategories: AssetCategoryOption[];
  onLocate: (entity: WorldEntity) => void;
  onLocateAll?: () => void;
}) {
  return (
    <section className="relationship-section" aria-label="Verified project relationships">
      <div className="relationship-heading">
        <span>RELATIONSHIPS</span>
        <div className="relationship-heading-actions">
          {onLocateAll && <button type="button" onClick={onLocateAll}>Locate all</button>}
          <b>{related.length}</b>
        </div>
      </div>
      {related.length > 0 ? related.map(({ entity, relationship }) => (
        <button key={relationship.id} type="button" onClick={() => onLocate(entity)}>
          <i className={`relationship-type entity-glyph type-${entity.type}`}>
            <EntityIcon entity={entity} assetCategories={assetCategories} rfiColor={rfiStatusColor} formColor={formStatusColor} />
          </i>
          <span><small>{relationship.label}</small><strong>{entity.title}</strong></span>
          <em>Locate</em>
        </button>
      )) : <p>No verified links to loaded world entities.</p>}
    </section>
  );
}

function AssetDetail({ entity, projectName, actionSection, relationshipSection, onClose }: EntityDetailProps) {
  const raw = entity.metadata.raw && typeof entity.metadata.raw === "object"
    ? entity.metadata.raw as Record<string, unknown>
    : {};
  const value = (...candidates: unknown[]) => {
    const candidate = candidates.find((item) => (typeof item === "string" && Boolean(item.trim())) || typeof item === "number");
    return typeof candidate === "number" ? String(candidate) : candidate;
  };
  const details = [
    ["Status", value(entity.status, entity.metadata.statusName)],
    ["Category", value(entity.metadata.categoryName, raw.categoryId)],
    ["Location", value(raw.locationId)],
    ["Barcode", value(raw.barcode)],
    ["Company", value(raw.companyName, raw.companyId)],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
  return (
    <aside className="world-detail asset-detail" aria-live="polite">
      <button className="detail-close" type="button" onClick={onClose} aria-label="Close asset details">×</button>
      <span className="detail-kicker">LIVE APS ASSET</span>
      <div className="detail-color asset-color" />
      <h2>{entity.title}</h2>
      <p>This object represents one specific asset in the selected Autodesk project.</p>
      <dl>
        {details.map(([label, detailValue]) => <div key={label}><dt>{label}</dt><dd>{detailValue}</dd></div>)}
        <div><dt>Project</dt><dd>{projectName}</dd></div>
        <div><dt>Zone</dt><dd>{entity.zone ?? "assets"}</dd></div>
      </dl>
      {actionSection}
      {relationshipSection}
      <details className="world-technical"><summary>Technical details</summary><small>APS ID · {entity.externalId}</small></details>
    </aside>
  );
}

function IssueDetail({ entity, projectName, actionSection, relationshipSection, onClose }: EntityDetailProps) {
  const raw = entity.metadata.raw && typeof entity.metadata.raw === "object"
    ? entity.metadata.raw as Record<string, unknown>
    : {};
  const value = (...candidates: unknown[]) => candidates.find((candidate): candidate is string => typeof candidate === "string" && Boolean(candidate.trim()));
  const visualState = typeof entity.metadata.visualState === "string"
    ? entity.metadata.visualState as IssueVisualState
    : "unknown";
  const details = [
    ["Status", value(entity.status)],
    ["Assigned to", value(raw.assignedTo, raw.assignedToType)],
    ["Due date", value(raw.dueDate)],
    ["Location", value(raw.locationDetails, raw.locationId)],
    ["Type", value(raw.issueTypeId, raw.issueSubtypeId)],
    ["Description", value(raw.description)],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
  return (
    <aside className="world-detail issue-detail" aria-live="polite">
      <button className="detail-close" type="button" onClick={onClose} aria-label="Close issue details">×</button>
      <span className="detail-kicker">LIVE APS ISSUE</span>
      <div className="detail-color" style={{ background: issueStateColor(visualState) }} />
      <h2>{entity.title}</h2>
      <p>This marker represents one specific issue in the selected Autodesk project.</p>
      <dl>
        {details.map(([label, detailValue]) => <div key={label}><dt>{label}</dt><dd>{detailValue}</dd></div>)}
        <div><dt>Project</dt><dd>{projectName}</dd></div>
        <div><dt>World state</dt><dd>{visualState}</dd></div>
      </dl>
      {actionSection}
      {relationshipSection}
      <details className="world-technical"><summary>Technical details</summary><small>APS ID · {entity.externalId}</small></details>
    </aside>
  );
}

function PersonDetail({ entity, projectName, actionSection, relationshipSection, onClose }: EntityDetailProps) {
  const raw = entity.metadata.raw && typeof entity.metadata.raw === "object"
    ? entity.metadata.raw as Record<string, unknown>
    : {};
  const value = (...candidates: unknown[]) => candidates.find((candidate): candidate is string => typeof candidate === "string" && Boolean(candidate.trim()));
  const roles = Array.isArray(raw.roles)
    ? raw.roles.map((role) => typeof role === "string" ? role : role && typeof role === "object" && typeof (role as Record<string, unknown>).name === "string" ? (role as Record<string, unknown>).name as string : "").filter(Boolean).join(", ")
    : value(raw.role);
  const details = [
    ["Company", value(entity.metadata.companyName, raw.companyName)],
    ["Role", roles],
    ["Status", value(entity.status)],
    ["Email", value(raw.email)],
    ["World activity", ["Walking the village", "Working", "Available"][hashText(entity.externalId) % 3] + " · symbolic"],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
  return (
    <aside className="world-detail person-detail" aria-live="polite">
      <button className="detail-close" type="button" onClick={onClose} aria-label="Close person details">×</button>
      <span className="detail-kicker">LIVE PROJECT MEMBER</span>
      <div className="detail-color person-color" />
      <h2>{entity.title}</h2>
      <p>This NPC represents one real member of the selected Autodesk project. Its world position is symbolic.</p>
      <dl>
        {details.map(([label, detailValue]) => <div key={label}><dt>{label}</dt><dd>{detailValue}</dd></div>)}
        <div><dt>Project</dt><dd>{projectName}</dd></div>
      </dl>
      {actionSection}
      {relationshipSection}
      <details className="world-technical"><summary>Technical details</summary><small>APS ID · {entity.externalId}</small></details>
    </aside>
  );
}

function DocumentDetail({ entity, projectName, scope, relationshipSection, onClose }: EntityDetailProps & { scope?: string }) {
  const raw = entity.metadata.raw && typeof entity.metadata.raw === "object"
    ? entity.metadata.raw as Record<string, unknown>
    : {};
  const attributes = raw.attributes && typeof raw.attributes === "object"
    ? raw.attributes as Record<string, unknown>
    : {};
  const value = (...candidates: unknown[]) => {
    const candidate = candidates.find((item) => (typeof item === "string" && Boolean(item.trim())) || typeof item === "number");
    return typeof candidate === "number" ? String(candidate) : candidate;
  };
  const extension = attributes.extension && typeof attributes.extension === "object"
    ? attributes.extension as Record<string, unknown>
    : {};
  const details = [
    ["Resource", value(entity.metadata.resourceType)],
    ["File type", value(extension.type, attributes.fileType)],
    ["Version", value(attributes.versionNumber, attributes.version)],
    ["Modified", value(attributes.lastModifiedTime, attributes.lastModifiedAt)],
    ["Created", value(attributes.createTime, attributes.createdAt)],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
  return (
    <aside className="world-detail document-detail" aria-live="polite">
      <button className="detail-close" type="button" onClick={onClose} aria-label="Close document details">×</button>
      <span className="detail-kicker">LIVE APS DOCUMENT</span>
      <div className="detail-color document-color" />
      <h2>{entity.title}</h2>
      <p>This object represents one real Data Management resource from the selected project.</p>
      <dl>
        {details.map(([label, detailValue]) => <div key={label}><dt>{label}</dt><dd>{detailValue}</dd></div>)}
        <div><dt>Project</dt><dd>{projectName}</dd></div>
        {scope && <div><dt>Loaded set</dt><dd>{scope}</dd></div>}
      </dl>
      {relationshipSection}
      <details className="world-technical"><summary>Technical details</summary><small>APS ID · {entity.externalId}</small></details>
    </aside>
  );
}

function RfiDetail({ entity, projectName, relationshipSection, onClose }: EntityDetailProps) {
  const raw = entity.metadata.raw && typeof entity.metadata.raw === "object"
    ? entity.metadata.raw as Record<string, unknown>
    : {};
  const value = (...candidates: unknown[]) => {
    const candidate = candidates.find((item) => (typeof item === "string" && Boolean(item.trim())) || typeof item === "number");
    return typeof candidate === "number" ? String(candidate) : candidate;
  };
  const details = [
    ["Status", value(entity.status)],
    ["Identifier", value(raw.customIdentifier, raw.identifier)],
    ["Discipline", value(raw.discipline, raw.disciplineId)],
    ["Due", value(raw.dueDate)],
    ["Assigned to", value(raw.assignedTo, raw.respondedBy)],
    ["Created", value(raw.createdAt)],
    ["Updated", value(raw.updatedAt)],
    ["Question", value(raw.question, raw.description)],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
  return (
    <aside className="world-detail rfi-detail" aria-live="polite">
      <button className="detail-close" type="button" onClick={onClose} aria-label="Close RFI details">×</button>
      <span className="detail-kicker">LIVE APS RFI</span>
      <div className="detail-color" style={{ background: rfiStatusColor(entity.status) }} />
      <h2>{entity.title}</h2>
      <p>This board represents one specific RFI returned by the selected Autodesk project. Only fields APS returned are shown.</p>
      <dl>
        {details.map(([label, detailValue]) => <div key={label}><dt>{label}</dt><dd>{detailValue}</dd></div>)}
        <div><dt>Project</dt><dd>{projectName}</dd></div>
      </dl>
      {relationshipSection}
      <details className="world-technical"><summary>Technical details</summary><small>APS ID · {entity.externalId}</small></details>
    </aside>
  );
}

function FormDetail({ entity, projectName, actionSection, relationshipSection, onClose }: EntityDetailProps) {
  const raw = entity.metadata.raw && typeof entity.metadata.raw === "object"
    ? entity.metadata.raw as Record<string, unknown>
    : {};
  const value = (...candidates: unknown[]) => {
    const candidate = candidates.find((item) => (typeof item === "string" && Boolean(item.trim())) || typeof item === "number");
    return typeof candidate === "number" ? String(candidate) : candidate;
  };
  const details = [
    ["Status", value(entity.status)],
    ["Type", value(raw.formType, raw.type)],
    ["Template", value(raw.templateName, raw.templateId)],
    ["Location", value(raw.locationName, raw.locationId)],
    ["Updated", value(raw.updatedAt, raw.lastUpdatedAt)],
    ["Description", value(raw.description)],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
  return (
    <aside className="world-detail form-detail" aria-live="polite">
      <button className="detail-close" type="button" onClick={onClose} aria-label="Close form details">×</button>
      <span className="detail-kicker">LIVE APS FORM</span>
      <div className="detail-color" style={{ background: formStatusColor(entity.status) }} />
      <h2>{entity.title}</h2>
      <p>This checkpoint represents one specific form returned by the selected Autodesk project.</p>
      <dl>
        {details.map(([label, detailValue]) => <div key={label}><dt>{label}</dt><dd>{detailValue}</dd></div>)}
        <div><dt>Project</dt><dd>{projectName}</dd></div>
      </dl>
      {actionSection}
      {relationshipSection}
      <details className="world-technical"><summary>Technical details</summary><small>APS ID · {entity.externalId}</small></details>
    </aside>
  );
}

function Zone({
  zone,
  position,
  selected,
  onSelect,
  onFocus,
}: {
  zone: WorldZone;
  position: [number, number, number];
  selected: boolean;
  onSelect: (id: ZoneId) => void;
  onFocus: (id: ZoneId) => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <group
      position={position}
      onPointerOver={(event) => { event.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
      onClick={(event) => { event.stopPropagation(); onSelect(zone.id); }}
      onDoubleClick={(event) => { event.stopPropagation(); onFocus(zone.id); }}
    >
      <ZoneGround zone={zone} selected={selected} hovered={hovered} />
      <DistrictDecor zone={zone} />
      <ZoneModel zone={zone} />
    </group>
  );
}

function DistrictDecor({ zone }: { zone: WorldZone }) {
  const edgeX = zone.size[0] / 2 - .5;
  const edgeZ = zone.size[1] / 2 - .5;
  const seed = hashText(zone.id);
  const fenced = zone.kind === "assets";
  return (
    <>
      {fenced && <YardFence width={zone.size[0]} depth={zone.size[1]} />}
      {zone.kind === "people" ? (
        // The camp already carries a container, tables, a brazier and a pickup;
        // one lamp at the back corner is all the district scenery it needs, and
        // a tree here would stand inside the parked truck.
        <SitePost position={[-edgeX, 0, -edgeZ]} color={zone.color} />
      ) : zone.kind === "issues" ? (
        <>
          <SitePost position={[-edgeX, 0, -edgeZ]} color={zone.color} />
          <SitePost position={[edgeX, 0, -edgeZ]} color={zone.color} />
          {/* The bays fill five of six slots; the crane parks in the free one so
              it adds height to the flat asphalt without standing over any cone.
              A quarter turn puts its long axis across the isometric view, so the
              boom is read from the side rather than end-on. */}
          <group position={[4.55, 0, 2.3]}><MobileCrane rotation={Math.PI / 4} /></group>
          <JerseyBarrier position={[-2.2, 0, edgeZ - .1]} rotation={.06} />
          <JerseyBarrier position={[-1.1, 0, edgeZ - .1]} rotation={-.04} />
          <DirtMound position={[6.1, 0, -edgeZ + .3]} seed={seed} />
          {/* The corridor between the two rows of bays is the only continuous
              open ground in the yard. Barrier fencing was tried here and removed:
              standing in open asphalt it fenced nothing off, and seen edge-on it
              read as a stray coloured post. */}
          <Scaffold position={[-3.6, 0, .1]} rotation={Math.PI / 4} />
          <WarningSign position={[-6.1, 0, .2]} rotation={Math.PI / 4} />
        </>
      ) : (
        <>
          <SitePost position={[-edgeX, 0, -edgeZ]} color={zone.color} />
          <PineTree position={[edgeX, 0, -edgeZ]} seed={seed} />
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Shared site props and materials
// ---------------------------------------------------------------------------

// Everything the world builds stands on brown dirt, so the built palette is
// deliberately cool and light: painted steel, white panelling and pale timber.
// Nothing structural reuses a dirt-adjacent brown, or it disappears into the
// ground it stands on.
const STEEL_LIGHT = "#ccd6db";
const STEEL = "#93a6b2";
const STEEL_DARK = "#4f6473";
const PANEL = "#f0f3f2";
const WOOD_LIGHT = "#e3c795";

/**
 * Set dressing must never intercept a click meant for a project record, so every
 * prop mesh below opts out of raycasting entirely. A click that lands on a prop
 * falls through to the district ground underneath, which is what the user meant.
 */
const ignoreRaycast = () => null;

/**
 * Small mobile crane, parked. One connected machine: the boom hangs off a pivot
 * group whose origin sits on the turret, and every boom part is positioned along
 * that group's own axis, so the arm always meets the body no matter how the
 * crane is turned. The earlier version placed the boom in the crane's own space
 * with a hand-computed offset that did not land on the turret, which left the
 * arm floating beside the machine. It does not slew either — a swinging boom
 * only made the parts read as separate objects.
 */
const CRANE_PIVOT: [number, number] = [0.35, 0.72];
const CRANE_BOOM_ANGLE = 0.85;
const CRANE_BOOM_LENGTH = 1.8;
const CRANE_TIP: [number, number] = [
  CRANE_PIVOT[0] + Math.cos(CRANE_BOOM_ANGLE) * CRANE_BOOM_LENGTH,
  CRANE_PIVOT[1] + Math.sin(CRANE_BOOM_ANGLE) * CRANE_BOOM_LENGTH,
];
const CRANE_YELLOW = "#e8b62c";

function MobileCrane({ rotation = 0 }: { rotation?: number }) {
  return (
    <group rotation={[0, rotation, 0]} scale={0.95}>
      {/* Chassis */}
      <mesh raycast={ignoreRaycast} castShadow receiveShadow position={[0, 0.34, 0]}>
        <boxGeometry args={[1.7, 0.3, 0.78]} />
        <meshStandardMaterial color={CRANE_YELLOW} roughness={0.6} metalness={0.15} />
      </mesh>
      <mesh raycast={ignoreRaycast} castShadow position={[0, 0.18, 0]}>
        <boxGeometry args={[1.5, 0.16, 0.6]} />
        <meshStandardMaterial color="#3f464c" roughness={0.75} />
      </mesh>
      {/* Cab at the front */}
      <mesh raycast={ignoreRaycast} castShadow position={[-0.56, 0.71, 0]}>
        <boxGeometry args={[0.56, 0.44, 0.7] } />
        <meshStandardMaterial color={CRANE_YELLOW} roughness={0.6} metalness={0.15} />
      </mesh>
      <mesh raycast={ignoreRaycast} position={[-0.56, 0.76, 0.36]}>
        <boxGeometry args={[0.4, 0.24, 0.02]} />
        <meshStandardMaterial color="#4a5a63" roughness={0.35} metalness={0.25} />
      </mesh>
      <mesh raycast={ignoreRaycast} position={[-0.85, 0.76, 0]}>
        <boxGeometry args={[0.02, 0.24, 0.5]} />
        <meshStandardMaterial color="#4a5a63" roughness={0.35} metalness={0.25} />
      </mesh>
      {/* Wheels */}
      {[[-0.58, -0.42], [-0.58, 0.42], [0.16, -0.42], [0.16, 0.42], [0.66, -0.42], [0.66, 0.42]].map(([x, z], index) => (
        <mesh key={index} raycast={ignoreRaycast} castShadow position={[x, 0.19, z]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.19, 0.19, 0.14, 12]} />
          <meshStandardMaterial color="#2f343a" roughness={0.85} />
        </mesh>
      ))}
      {/* Outrigger pads, so the machine reads as set up rather than driving */}
      {[-0.6, 0.6].map((z) => (
        <group key={z}>
          <mesh raycast={ignoreRaycast} castShadow position={[0.45, 0.28, z]}>
            <boxGeometry args={[0.16, 0.1, 0.36]} />
            <meshStandardMaterial color="#9aa4aa" roughness={0.6} metalness={0.3} />
          </mesh>
          <mesh raycast={ignoreRaycast} castShadow receiveShadow position={[0.45, 0.05, z * 1.25]}>
            <boxGeometry args={[0.3, 0.1, 0.3]} />
            <meshStandardMaterial color="#4f6473" roughness={0.85} />
          </mesh>
        </group>
      ))}
      {/* Slew ring and turret the boom pivots on */}
      <mesh raycast={ignoreRaycast} castShadow position={[CRANE_PIVOT[0], 0.55, 0]}>
        <cylinderGeometry args={[0.3, 0.34, 0.16, 12]} />
        <meshStandardMaterial color="#9aa4aa" roughness={0.55} metalness={0.35} />
      </mesh>
      <mesh raycast={ignoreRaycast} castShadow position={[CRANE_PIVOT[0], CRANE_PIVOT[1], 0]}>
        <boxGeometry args={[0.44, 0.34, 0.5]} />
        <meshStandardMaterial color={CRANE_YELLOW} roughness={0.6} metalness={0.15} />
      </mesh>
      {/* Boom: built along the pivot group's own axis, so it cannot detach */}
      <group position={[CRANE_PIVOT[0], CRANE_PIVOT[1], 0]} rotation={[0, 0, CRANE_BOOM_ANGLE]}>
        <mesh raycast={ignoreRaycast} castShadow position={[CRANE_BOOM_LENGTH / 2, 0, 0]}>
          <boxGeometry args={[CRANE_BOOM_LENGTH, 0.2, 0.22]} />
          <meshStandardMaterial color={CRANE_YELLOW} roughness={0.55} metalness={0.2} />
        </mesh>
        {/* Telescopic section, inset so the boom reads as two stages */}
        <mesh raycast={ignoreRaycast} castShadow position={[CRANE_BOOM_LENGTH * 0.72, 0, 0]}>
          <boxGeometry args={[CRANE_BOOM_LENGTH * 0.56, 0.15, 0.17]} />
          <meshStandardMaterial color="#f2d071" roughness={0.55} metalness={0.2} />
        </mesh>
        {/* Head sheave at the very end of the boom */}
        <mesh raycast={ignoreRaycast} castShadow position={[CRANE_BOOM_LENGTH, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.1, 0.1, 0.16, 10]} />
          <meshStandardMaterial color="#3f464c" roughness={0.6} metalness={0.35} />
        </mesh>
        {/* Lift ram from the turret to the underside of the boom */}
        <mesh raycast={ignoreRaycast} castShadow position={[CRANE_BOOM_LENGTH * 0.3, -0.16, 0]} rotation={[0, 0, Math.PI / 2 - 0.12]}>
          <cylinderGeometry args={[0.05, 0.06, CRANE_BOOM_LENGTH * 0.5, 8]} />
          <meshStandardMaterial color="#9aa4aa" roughness={0.5} metalness={0.4} />
        </mesh>
      </group>
      {/* Hoist rope and hook hang straight down from the boom head */}
      <mesh raycast={ignoreRaycast} position={[CRANE_TIP[0], CRANE_TIP[1] - 0.34, 0]}>
        <cylinderGeometry args={[0.014, 0.014, 0.68, 6]} />
        <meshStandardMaterial color="#3f464c" roughness={0.6} />
      </mesh>
      <mesh raycast={ignoreRaycast} castShadow position={[CRANE_TIP[0], CRANE_TIP[1] - 0.76, 0]}>
        <boxGeometry args={[0.16, 0.2, 0.16]} />
        <meshStandardMaterial color="#2f343a" roughness={0.7} metalness={0.3} />
      </mesh>
      {/* Warning stripe on the rear of the chassis */}
      <mesh raycast={ignoreRaycast} position={[0.87, 0.34, 0]}>
        <boxGeometry args={[0.02, 0.22, 0.7]} />
        <meshStandardMaterial color="#2f343a" roughness={0.8} />
      </mesh>
    </group>
  );
}

/** Small tube scaffold with a boarded deck, as put up beside a repair. */
function Scaffold({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  const halfWidth = .7;
  const halfDepth = .38;
  const height = 1.25;
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {[[-halfWidth, -halfDepth], [halfWidth, -halfDepth], [-halfWidth, halfDepth], [halfWidth, halfDepth]].map(([x, z], index) => (
        <group key={index}>
          <mesh raycast={ignoreRaycast} castShadow receiveShadow position={[x, .03, z]}>
            <boxGeometry args={[.16, .06, .16]} />
            <meshStandardMaterial color="#4f6473" roughness={.8} />
          </mesh>
          <mesh raycast={ignoreRaycast} castShadow position={[x, height / 2, z]}>
            <cylinderGeometry args={[.035, .035, height, 8]} />
            <meshStandardMaterial color="#b9c6cd" roughness={.5} metalness={.4} />
          </mesh>
        </group>
      ))}
      {/* Ledgers at two lifts, plus a diagonal brace on the open face */}
      {[.42, .86, 1.22].map((y) => (
        <group key={y}>
          {[-halfDepth, halfDepth].map((z) => (
            <mesh key={z} raycast={ignoreRaycast} castShadow position={[0, y, z]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[.028, .028, halfWidth * 2, 6]} />
              <meshStandardMaterial color="#b9c6cd" roughness={.5} metalness={.4} />
            </mesh>
          ))}
        </group>
      ))}
      <mesh raycast={ignoreRaycast} castShadow position={[0, .64, -halfDepth]} rotation={[0, 0, .72]}>
        <boxGeometry args={[.05, 1.6, .05]} />
        <meshStandardMaterial color="#93a6b2" roughness={.55} metalness={.35} />
      </mesh>
      {/* Boarded working deck and its toe board */}
      {[-.17, .17].map((z) => (
        <mesh key={z} raycast={ignoreRaycast} castShadow receiveShadow position={[0, .89, z]}>
          <boxGeometry args={[halfWidth * 2 + .12, .05, .32]} />
          <meshStandardMaterial color="#e3c795" roughness={.92} />
        </mesh>
      ))}
      <mesh raycast={ignoreRaycast} castShadow position={[0, .97, halfDepth]}>
        <boxGeometry args={[halfWidth * 2, .12, .04]} />
        <meshStandardMaterial color="#e8b62c" roughness={.7} />
      </mesh>
      {/* Ladder up the near end */}
      <group position={[halfWidth, 0, 0]}>
        {[-.1, .1].map((z) => (
          <mesh key={z} raycast={ignoreRaycast} position={[.1, .45, z]} rotation={[0, 0, .12]}>
            <cylinderGeometry args={[.02, .02, .92, 6]} />
            <meshStandardMaterial color="#b9c6cd" roughness={.5} metalness={.4} />
          </mesh>
        ))}
        {[.18, .42, .66].map((y) => (
          <mesh key={y} raycast={ignoreRaycast} position={[.12, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[.016, .016, .2, 6]} />
            <meshStandardMaterial color="#b9c6cd" roughness={.5} metalness={.4} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** Triangular hazard sign on a post. */
function WarningSign({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh raycast={ignoreRaycast} castShadow receiveShadow position={[0, .04, 0]}>
        <boxGeometry args={[.3, .08, .3]} />
        <meshStandardMaterial color="#4f6473" roughness={.85} />
      </mesh>
      <mesh raycast={ignoreRaycast} castShadow position={[0, .42, 0]}>
        <cylinderGeometry args={[.03, .035, .76, 6]} />
        <meshStandardMaterial color="#d8dde0" roughness={.6} />
      </mesh>
      <mesh raycast={ignoreRaycast} castShadow position={[0, .86, .02]}>
        <circleGeometry args={[.3, 3]} />
        <meshStandardMaterial color="#e8b62c" roughness={.7} side={2} />
      </mesh>
      <mesh raycast={ignoreRaycast} position={[0, .86, .03]}>
        <circleGeometry args={[.22, 3]} />
        <meshStandardMaterial color="#f4d98a" roughness={.75} side={2} />
      </mesh>
      <mesh raycast={ignoreRaycast} position={[0, .82, .04]}>
        <boxGeometry args={[.05, .16, .01]} />
        <meshStandardMaterial color="#2f343a" roughness={.8} />
      </mesh>
    </group>
  );
}

/** Concrete Jersey barrier. */
function JerseyBarrier({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh raycast={ignoreRaycast} castShadow receiveShadow position={[0, .09, 0]}>
        <boxGeometry args={[1.0, .18, .32]} />
        <meshStandardMaterial color="#cfcabc" roughness={.95} />
      </mesh>
      <mesh raycast={ignoreRaycast} castShadow position={[0, .3, 0]}>
        <boxGeometry args={[.94, .26, .18]} />
        <meshStandardMaterial color="#dcd7c9" roughness={.95} />
      </mesh>
      <mesh raycast={ignoreRaycast} position={[0, .35, .095]}>
        <boxGeometry args={[.3, .1, .01]} />
        <meshStandardMaterial color="#d4593f" roughness={.85} />
      </mesh>
    </group>
  );
}

/** Small heap of spoil, as left beside an active repair. */
function DirtMound({ position, seed }: { position: [number, number, number]; seed: number }) {
  return (
    <group position={position} rotation={[0, ((seed >>> 3) % 360) * (Math.PI / 180), 0]}>
      <mesh raycast={ignoreRaycast} castShadow receiveShadow position={[0, .13, 0]}>
        <coneGeometry args={[.46, .3, 8]} />
        <meshStandardMaterial color="#8a6a45" roughness={1} />
      </mesh>
      <mesh raycast={ignoreRaycast} castShadow receiveShadow position={[.34, .07, .18]}>
        <coneGeometry args={[.26, .18, 7]} />
        <meshStandardMaterial color="#7d6142" roughness={1} />
      </mesh>
    </group>
  );
}

/** Site office container — the skurvogn every construction site has. */
function SiteOfficeContainer({ position, rotation = 0, accent }: { position: [number, number, number]; rotation?: number; accent: string }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Blocks it sits on, so it reads as delivered rather than built */}
      {[-.9, .9].map((x) => (
        <mesh key={x} raycast={ignoreRaycast} castShadow receiveShadow position={[x, .07, 0]}>
          <boxGeometry args={[.24, .14, .9]} />
          <meshStandardMaterial color="#8f8a80" roughness={.95} />
        </mesh>
      ))}
      <mesh raycast={ignoreRaycast} castShadow receiveShadow position={[0, .55, 0]}>
        <boxGeometry args={[2.4, .82, 1.1]} />
        <meshStandardMaterial color="#eef2f4" roughness={.72} />
      </mesh>
      {/* Ribbed sides */}
      {[-.8, -.3, .2, .7].map((x) => (
        <mesh key={x} raycast={ignoreRaycast} position={[x, .55, .56]}>
          <boxGeometry args={[.06, .78, .02]} />
          <meshStandardMaterial color="#d6dee2" roughness={.75} />
        </mesh>
      ))}
      {/* Door and windows */}
      <mesh raycast={ignoreRaycast} position={[-.78, .48, .57]}>
        <boxGeometry args={[.36, .62, .02]} />
        <meshStandardMaterial color="#4a5a63" roughness={.6} />
      </mesh>
      {[.1, .72].map((x) => (
        <mesh key={x} raycast={ignoreRaycast} position={[x, .62, .57]}>
          <boxGeometry args={[.44, .3, .02]} />
          <meshStandardMaterial color="#7fb3c8" roughness={.35} metalness={.2} />
        </mesh>
      ))}
      <mesh raycast={ignoreRaycast} castShadow position={[0, .99, 0]}>
        <boxGeometry args={[2.48, .1, 1.18]} />
        <meshStandardMaterial color={accent} roughness={.7} />
      </mesh>
      {/* Entrance step */}
      <mesh raycast={ignoreRaycast} castShadow receiveShadow position={[-.78, .1, .74]}>
        <boxGeometry args={[.5, .12, .3]} />
        <meshStandardMaterial color="#9aa4aa" roughness={.9} />
      </mesh>
    </group>
  );
}

/** Blocky parked pickup. */
function PickupTruck({ position, rotation = 0, color }: { position: [number, number, number]; rotation?: number; color: string }) {
  return (
    <group position={position} rotation={[0, rotation, 0]} scale={.9}>
      <mesh raycast={ignoreRaycast} castShadow receiveShadow position={[-.34, .38, 0]}>
        <boxGeometry args={[.72, .38, .72]} />
        <meshStandardMaterial color={color} roughness={.55} metalness={.2} />
      </mesh>
      <mesh raycast={ignoreRaycast} position={[-.34, .44, .37]}>
        <boxGeometry args={[.5, .22, .02]} />
        <meshStandardMaterial color="#8fc4d6" roughness={.3} metalness={.2} />
      </mesh>
      {/* Bonnet */}
      <mesh raycast={ignoreRaycast} castShadow position={[-.92, .3, 0]}>
        <boxGeometry args={[.46, .22, .7]} />
        <meshStandardMaterial color={color} roughness={.55} metalness={.2} />
      </mesh>
      {/* Flatbed with side walls */}
      <mesh raycast={ignoreRaycast} castShadow receiveShadow position={[.42, .26, 0]}>
        <boxGeometry args={[.96, .1, .72]} />
        <meshStandardMaterial color="#d7dde0" roughness={.7} metalness={.15} />
      </mesh>
      {[-.36, .36].map((z) => (
        <mesh key={z} raycast={ignoreRaycast} castShadow position={[.42, .38, z]}>
          <boxGeometry args={[.96, .22, .05]} />
          <meshStandardMaterial color={color} roughness={.6} metalness={.2} />
        </mesh>
      ))}
      <mesh raycast={ignoreRaycast} castShadow position={[.9, .38, 0]}>
        <boxGeometry args={[.05, .22, .72]} />
        <meshStandardMaterial color={color} roughness={.6} metalness={.2} />
      </mesh>
      {[[-.72, -.37], [-.72, .37], [.56, -.37], [.56, .37]].map(([x, z], index) => (
        <mesh key={index} raycast={ignoreRaycast} castShadow position={[x, .16, z]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[.16, .16, .1, 12]} />
          <meshStandardMaterial color="#2f343a" roughness={.85} />
        </mesh>
      ))}
    </group>
  );
}

/** Wheelbarrow: an open tray on one wheel with two handles. */
function Wheelbarrow({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]} scale={.9}>
      {/* Tray: floor plus four thin walls, so it reads as open on top */}
      <mesh raycast={ignoreRaycast} castShadow receiveShadow position={[0, .26, 0]}>
        <boxGeometry args={[.44, .03, .34]} />
        <meshStandardMaterial color="#c8622f" roughness={.65} metalness={.15} />
      </mesh>
      {[-.19, .19].map((x) => (
        <mesh key={x} raycast={ignoreRaycast} castShadow position={[x, .34, 0]} rotation={[0, 0, x > 0 ? -.22 : .22]}>
          <boxGeometry args={[.03, .18, .34]} />
          <meshStandardMaterial color="#c8622f" roughness={.65} metalness={.15} />
        </mesh>
      ))}
      {[-.16, .16].map((z) => (
        <mesh key={z} raycast={ignoreRaycast} castShadow position={[0, .34, z]} rotation={[z > 0 ? .22 : -.22, 0, 0]}>
          <boxGeometry args={[.44, .18, .03]} />
          <meshStandardMaterial color="#c8622f" roughness={.65} metalness={.15} />
        </mesh>
      ))}
      {/* Handles running back past the tray */}
      {[-.13, .13].map((z) => (
        <mesh key={z} raycast={ignoreRaycast} castShadow position={[.34, .27, z]} rotation={[0, 0, .12]}>
          <cylinderGeometry args={[.022, .022, .56, 6]} />
          <meshStandardMaterial color="#8a6a45" roughness={.9} />
        </mesh>
      ))}
      {[-.13, .13].map((z) => (
        <mesh key={z} raycast={ignoreRaycast} position={[.5, .12, z]}>
          <cylinderGeometry args={[.018, .018, .24, 6]} />
          <meshStandardMaterial color="#7d8890" roughness={.6} metalness={.3} />
        </mesh>
      ))}
      <mesh raycast={ignoreRaycast} castShadow position={[-.3, .14, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[.14, .14, .07, 12]} />
        <meshStandardMaterial color="#2f343a" roughness={.85} />
      </mesh>
    </group>
  );
}

/** Low bush cluster. */
function Bush({ position, seed }: { position: [number, number, number]; seed: number }) {
  const tint = ["#4f7a44", "#5d8a4c", "#456e3d"][seed % 3];
  return (
    <group position={position} rotation={[0, ((seed >>> 6) % 360) * (Math.PI / 180), 0]} scale={.85 + ((seed >>> 2) % 30) / 100}>
      <mesh raycast={ignoreRaycast} castShadow receiveShadow position={[0, .17, 0]}>
        <dodecahedronGeometry args={[.22, 0]} />
        <meshStandardMaterial color={tint} roughness={.98} />
      </mesh>
      <mesh raycast={ignoreRaycast} castShadow position={[.19, .12, .08]}>
        <dodecahedronGeometry args={[.15, 0]} />
        <meshStandardMaterial color={tint} roughness={.98} />
      </mesh>
      <mesh raycast={ignoreRaycast} castShadow position={[-.15, .11, -.1]}>
        <dodecahedronGeometry args={[.13, 0]} />
        <meshStandardMaterial color="#6d9557" roughness={.98} />
      </mesh>
    </group>
  );
}

/** Loose rock cluster. */
function RockCluster({ position, seed }: { position: [number, number, number]; seed: number }) {
  return (
    <group position={position} rotation={[0, ((seed >>> 4) % 360) * (Math.PI / 180), 0]} scale={.75 + ((seed >>> 2) % 40) / 100}>
      {[[0, 0, .13], [.2, .11, .1], [-.14, .16, .075]].map(([x, z, size], index) => (
        <mesh key={index} raycast={ignoreRaycast} castShadow receiveShadow position={[x, size * .6, z]}>
          <dodecahedronGeometry args={[size, 0]} />
          <meshStandardMaterial color={index === 1 ? "#8d8b84" : "#9d9484"} roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

function PineTree({ position, seed }: { position: [number, number, number]; seed: number }) {
  const crown = useRef<Group>(null);
  const scale = .82 + ((seed >>> 3) % 40) / 100;
  const tint = ["#3f6b3c", "#4a7a44", "#37623a"][seed % 3];
  const phase = position[0] * .7 + position[2] * .4;
  useFrame(({ clock }) => {
    if (!crown.current) return;
    crown.current.rotation.z = Math.sin(clock.getElapsedTime() * .6 + phase) * .022;
  });
  return (
    <group position={position} scale={scale} rotation={[0, ((seed >>> 5) % 360) * (Math.PI / 180), 0]}>
      <mesh castShadow position={[0, .22, 0]}>
        <cylinderGeometry args={[.055, .075, .44, 6]} />
        <meshStandardMaterial color="#6b4d31" roughness={1} />
      </mesh>
      <group ref={crown}>
        <mesh castShadow position={[0, .66, 0]}><coneGeometry args={[.42, .62, 7]} /><meshStandardMaterial color={tint} roughness={.96} /></mesh>
        <mesh castShadow position={[0, 1.0, 0]}><coneGeometry args={[.31, .52, 7]} /><meshStandardMaterial color={tint} roughness={.96} /></mesh>
        <mesh castShadow position={[0, 1.3, 0]}><coneGeometry args={[.2, .42, 7]} /><meshStandardMaterial color={tint} roughness={.96} /></mesh>
      </group>
    </group>
  );
}

/** Steel mesh fence panels around an open work yard. */
function YardFence({ width, depth }: { width: number; depth: number }) {
  const posts = useMemo(() => {
    const halfW = width / 2;
    const halfD = depth / 2;
    const spacing = 1.15;
    const along = (length: number) => Math.max(2, Math.round(length / spacing));
    const spots: [number, number][] = [];
    const countX = along(width);
    const countZ = along(depth);
    for (let index = 0; index <= countX; index += 1) {
      const x = -halfW + (index / countX) * width;
      spots.push([x, -halfD]);
      spots.push([x, halfD]);
    }
    for (let index = 1; index < countZ; index += 1) {
      const z = -halfD + (index / countZ) * depth;
      spots.push([-halfW, z]);
      spots.push([halfW, z]);
    }
    return spots;
  }, [width, depth]);
  const halfW = width / 2;
  const halfD = depth / 2;
  return (
    <group>
      {posts.map(([x, z]) => (
        <mesh key={`${x}:${z}`} castShadow position={[x, .27, z]}>
          <boxGeometry args={[.07, .54, .07]} />
          <meshStandardMaterial color={STEEL_DARK} roughness={.6} metalness={.3} />
        </mesh>
      ))}
      {[.2, .44].map((y) => (
        <group key={y}>
          {[-halfD, halfD].map((z) => (
            <mesh key={z} castShadow position={[0, y, z]}><boxGeometry args={[width, .045, .035]} /><meshStandardMaterial color={STEEL_LIGHT} roughness={.55} metalness={.3} /></mesh>
          ))}
          {[-halfW, halfW].map((x) => (
            <mesh key={x} castShadow position={[x, y, 0]}><boxGeometry args={[.035, .045, depth]} /><meshStandardMaterial color={STEEL_LIGHT} roughness={.55} metalness={.3} /></mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/** Site floodlight on a steel mast. */
function SitePost({ position, color }: { position: [number, number, number]; color: string }) {
  return (
    <group position={position}>
      <mesh castShadow position={[0, .48, 0]}><cylinderGeometry args={[.04, .05, .96, 6]} /><meshStandardMaterial color={STEEL} roughness={.55} metalness={.35} /></mesh>
      <mesh castShadow position={[0, 1.0, 0]}><boxGeometry args={[.26, .14, .16]} /><meshStandardMaterial color={STEEL_DARK} roughness={.5} metalness={.4} /></mesh>
      <mesh position={[0, .96, .09]}><boxGeometry args={[.2, .1, .02]} /><meshStandardMaterial color="#fdf3d4" emissive={color} emissiveIntensity={.45} /></mesh>
    </group>
  );
}

/**
 * The district's name board, standing at the front edge where a visitor would
 * enter. The name is deliberately not attached to a building: a district may
 * have no building at all, and a board at the entrance is the same affordance
 * in every district.
 */
/** Panelled site cabin with a pitched roof in the district's accent colour. */
function Cabin({
  width,
  depth,
  height,
  wall = PANEL,
  roof,
  ridge = .62,
}: {
  width: number;
  depth: number;
  height: number;
  wall?: string;
  roof: string;
  ridge?: number;
}) {
  const panel = useMemo(() => brickTexture(wall, "#c3ccce", [Math.max(1, Math.round(width / 1.2)), 1]), [wall, width]);
  const shingle = useMemo(() => shingleTexture(roof, "#f2f4f3"), [roof]);
  const slope = Math.atan2(ridge, depth / 2);
  const rafter = Math.hypot(ridge, depth / 2);
  return (
    <group>
      {/* Concrete footing lifts the light panelling clear of the dirt */}
      <mesh castShadow receiveShadow position={[0, .07, 0]}>
        <boxGeometry args={[width + .2, .14, depth + .2]} />
        <meshStandardMaterial color="#b9c0c2" roughness={.95} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, .14 + height / 2, 0]}>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial map={panel} roughness={.82} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          castShadow
          position={[0, .14 + height + ridge / 2, side * depth / 4]}
          rotation={[side * slope, 0, 0]}
        >
          <boxGeometry args={[width + .34, .1, rafter + .18]} />
          <meshStandardMaterial map={shingle} roughness={.72} />
        </mesh>
      ))}
      <mesh castShadow position={[0, .14 + height + ridge, 0]}>
        <boxGeometry args={[width + .4, .1, .12]} />
        <meshStandardMaterial color={STEEL_DARK} roughness={.6} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={`gable${side}`} position={[side * width / 2, .14 + height + ridge / 2 - .02, 0]} rotation={[0, Math.PI / 2, 0]}>
          <cylinderGeometry args={[ridge / 2, ridge / 2, .02, 3]} />
          <meshStandardMaterial color={wall} roughness={.85} />
        </mesh>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// District ground and structures
// ---------------------------------------------------------------------------

/**
 * A district is a patch of worked ground, not a platform. It is drawn flush with
 * the terrain, so every structure and entity stands directly on it.
 */
const DISTRICT_GROUND_Y = 0.008;

function ZoneGround({ zone, selected, hovered }: { zone: WorldZone; selected: boolean; hovered: boolean }) {
  // Keyed by domain, not by id: the asset districts are generated per project,
  // so their ids are not known ahead of time.
  const surfaces: Record<ZoneKind, { color: string; grass: boolean }> = {
    project: { color: "#b39069", grass: false },
    documents: { color: "#a9835a", grass: false },
    // Laid asphalt: the issues district is an active works area, not a yard.
    issues: { color: "#53585c", grass: false },
    rfis: { color: "#9c8156", grass: false },
    forms: { color: "#ab8760", grass: false },
    people: { color: "#a89468", grass: false },
    assets: { color: "#a37e53", grass: false },
  };
  const surface = surfaces[zone.kind];
  const layer = DISTRICT_GROUND_Y + (hashText(zone.id) % 8) * 0.0004;
  const map = useMemo(() => (surface.grass
    ? grassTexture(surface.color, [Math.max(1, Math.round(zone.size[0] / 2)), Math.max(1, Math.round(zone.size[1] / 2))])
    : dirtTexture(surface.color, [Math.max(1, Math.round(zone.size[0] / 1.6)), Math.max(1, Math.round(zone.size[1] / 1.6))])),
    [surface.color, surface.grass, zone.size]);
  const halfWidth = zone.size[0] / 2;
  const halfDepth = zone.size[1] / 2;
  return (
    <group>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, layer, 0]}>
        <planeGeometry args={[zone.size[0], zone.size[1]]} />
        <meshStandardMaterial
          map={map}
          emissive={zone.color}
          emissiveIntensity={selected ? .1 : hovered ? .05 : 0}
          roughness={.99}
        />
      </mesh>
      {(selected || hovered) && (
        <group position={[0, layer + .012, 0]}>
          <Line
            points={[[-halfWidth, 0, -halfDepth], [halfWidth, 0, -halfDepth], [halfWidth, 0, halfDepth], [-halfWidth, 0, halfDepth], [-halfWidth, 0, -halfDepth]]}
            color={zone.color}
            transparent
            opacity={selected ? .8 : .4}
            lineWidth={selected ? 2 : 1}
          />
        </group>
      )}
    </group>
  );
}

function ZoneModel({ zone }: { zone: WorldZone }) {
  const color = zone.color;
  switch (zone.kind) {
    case "project": return <ProjectOfficeModel color={color} />;
    case "documents": return <DocumentsOfficeModel color={color} />;
    // Every asset district shares one structure on purpose: same kind of record,
    // different APS status.
    // The asset district carries its own intake, lanes and dispatch equipment,
    // rendered with the live yard layout rather than as fixed scenery.
    case "assets": return null;
    // The issues district carries no structure at all: the cones on the asphalt
    // are the only objects in it.
    case "issues": return null;
    case "rfis": return <RfiOfficeModel color={color} />;
    case "forms": return <FormsPostModel color={color} />;
    case "people": return <MembersCampModel color={color} />;
  }
}

/** RFIs — a query desk under an open canopy beside a small records cabin. */
function RfiOfficeModel({ color }: { color: string }) {
  return (
    <group position={[0, 0, -1.8]}>
      <group position={[-1.5, 0, 0]}>
        <Cabin width={2.0} depth={1.5} height={1.2} roof={color} ridge={.55} />
        <mesh position={[0, .92, .77]}><boxGeometry args={[.9, .42, .04]} /><meshStandardMaterial color="#8fc4d6" roughness={.3} metalness={.2} /></mesh>
        <mesh position={[0, .44, .77]}><boxGeometry args={[.5, .68, .04]} /><meshStandardMaterial color={STEEL_DARK} roughness={.7} /></mesh>
      </group>
      {/* No tent here either — the desk and question board read better open. */}
      <group position={[1.5, 0, 0]}>
        <mesh castShadow receiveShadow position={[0, .42, -.3]}><boxGeometry args={[1.9, .08, .5]} /><meshStandardMaterial color={PANEL} roughness={.85} /></mesh>
        {[-.78, .78].map((x) => (
          <mesh key={x} castShadow position={[x, .2, -.3]}><boxGeometry args={[.08, .4, .4]} /><meshStandardMaterial color={STEEL} roughness={.5} metalness={.35} /></mesh>
        ))}
        {/* Open question board: the desk where answers are requested */}
        <mesh castShadow position={[0, .82, -.55]} rotation={[-.2, 0, 0]}><boxGeometry args={[1.5, .6, .05]} /><meshStandardMaterial color={PANEL} roughness={.9} /></mesh>
        <mesh position={[0, .96, -.53]} rotation={[-.2, 0, 0]}><boxGeometry args={[1.2, .12, .02]} /><meshStandardMaterial color={color} roughness={.7} /></mesh>
      </group>
    </group>
  );
}

/** Project — the site office at the centre of the compound. */
function ProjectOfficeModel({ color }: { color: string }) {
  return (
    <group position={[0, 0, -1.1]}>
      <Cabin width={3.0} depth={2.0} height={1.5} roof={color} ridge={.8} />
      <mesh position={[0, .6, 1.03]}><boxGeometry args={[.5, .92, .04]} /><meshStandardMaterial color={STEEL_DARK} roughness={.7} /></mesh>
      {[-.95, .95].map((x) => (
        <mesh key={x} position={[x, .97, 1.03]}><boxGeometry args={[.44, .38, .04]} /><meshStandardMaterial color="#8fc4d6" roughness={.3} metalness={.2} /></mesh>
      ))}
      <group position={[1.9, 0, .5]}>
        <mesh castShadow position={[0, 1.2, 0]}><cylinderGeometry args={[.035, .045, 2.4, 8]} /><meshStandardMaterial color={STEEL_LIGHT} roughness={.5} metalness={.4} /></mesh>
        <mesh castShadow position={[.42, 2.05, 0]}><boxGeometry args={[.8, .34, .03]} /><meshStandardMaterial color={color} roughness={.75} /></mesh>
      </group>
    </group>
  );
}

/** Documents — a drafting office with a plan table and drawing tubes outside. */
function DocumentsOfficeModel({ color }: { color: string }) {
  return (
    <group position={[0, 0, -1.5]}>
      <Cabin width={2.4} depth={1.7} height={1.15} roof={color} ridge={.62} />
      <mesh position={[0, .52, .87]}><boxGeometry args={[.44, .78, .04]} /><meshStandardMaterial color={STEEL_DARK} roughness={.7} /></mesh>
      <mesh position={[.78, .84, .87]}><boxGeometry args={[.5, .34, .04]} /><meshStandardMaterial color="#8fc4d6" roughness={.3} metalness={.2} /></mesh>
      <group position={[1.9, 0, .4]}>
        <mesh castShadow position={[0, .54, 0]} rotation={[-.28, .2, 0]}><boxGeometry args={[.9, .05, .62]} /><meshStandardMaterial color={PANEL} roughness={.85} /></mesh>
        {[[-.35, -.22], [.35, -.22], [-.35, .22], [.35, .22]].map(([x, z]) => (
          <mesh key={`${x}:${z}`} castShadow position={[x, .25, z]}><boxGeometry args={[.055, .5, .055]} /><meshStandardMaterial color={STEEL} roughness={.5} metalness={.35} /></mesh>
        ))}
      </group>
      <group position={[-1.85, 0, .45]} rotation={[0, .3, 0]}>
        <mesh castShadow position={[0, .16, 0]}><boxGeometry args={[.6, .32, .34]} /><meshStandardMaterial color={STEEL_DARK} roughness={.6} /></mesh>
        {[-.16, 0, .16].map((x) => (
          <mesh key={x} castShadow position={[x, .44, 0]} rotation={[Math.PI / 2, 0, .12]}>
            <cylinderGeometry args={[.055, .055, .56, 8]} />
            <meshStandardMaterial color={PANEL} roughness={.8} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** Forms — the inspection checkpoint hut and boom gate. */
function FormsPostModel({ color }: { color: string }) {
  const boom = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (boom.current) boom.current.rotation.z = -.1 + Math.abs(Math.sin(clock.getElapsedTime() * .32)) * .95;
  });
  return (
    <group position={[0, 0, -1.5]}>
      <group position={[-1.15, 0, 0]}>
        <Cabin width={1.5} depth={1.4} height={1.2} roof={color} ridge={.5} />
        <mesh position={[0, .92, .72]}><boxGeometry args={[.8, .44, .04]} /><meshStandardMaterial color="#8fc4d6" roughness={.3} metalness={.2} /></mesh>
        <mesh position={[0, .4, .72]}><boxGeometry args={[.66, .2, .05]} /><meshStandardMaterial color={color} roughness={.7} /></mesh>
      </group>
      <group position={[.05, 0, .3]}>
        <mesh castShadow position={[0, .35, 0]}><cylinderGeometry args={[.09, .11, .7, 8]} /><meshStandardMaterial color={STEEL} roughness={.5} metalness={.4} /></mesh>
        <group ref={boom} position={[0, .66, 0]}>
          <mesh castShadow position={[.85, 0, 0]}><boxGeometry args={[1.7, .09, .09]} /><meshStandardMaterial color={PANEL} roughness={.7} /></mesh>
          {[.25, .75, 1.25].map((x) => (
            <mesh key={x} position={[x, 0, .05]}><boxGeometry args={[.22, .095, .02]} /><meshStandardMaterial color="#e2452f" roughness={.75} /></mesh>
          ))}
        </group>
      </group>
      <SitePost position={[1.7, 0, -.2]} color={color} />
    </group>
  );
}

/** Project Members — a site office container, mess canopy, brazier and pickup. */
function MembersCampModel({ color }: { color: string }) {
  return (
    <group position={[0, 0, -2.4]}>
      {/* Site office container: the first thing that arrives on a real site */}
      <SiteOfficeContainer position={[-3.1, 0, -.2]} rotation={.08} accent={color} />
      {/* No tent: the container is the crew's shelter, and the open trestle
          tables beside it keep the camp readable from above. */}
      <group position={[-.4, 0, .5]}>
        {[-.38, .38].map((z) => (
          <group key={z} position={[0, 0, z]}>
            <mesh castShadow receiveShadow position={[0, .4, 0]}><boxGeometry args={[1.9, .07, .4]} /><meshStandardMaterial color={PANEL} roughness={.85} /></mesh>
            {[-.78, .78].map((x) => (
              <mesh key={x} castShadow position={[x, .19, 0]}><boxGeometry args={[.07, .38, .34]} /><meshStandardMaterial color={STEEL} roughness={.5} metalness={.35} /></mesh>
            ))}
          </group>
        ))}
      </group>
      <group position={[2.2, 0, .5]}>
        {/* Steel brazier rather than an open campfire ring */}
        <mesh castShadow receiveShadow position={[0, .18, 0]}><cylinderGeometry args={[.3, .24, .36, 10]} /><meshStandardMaterial color={STEEL_DARK} roughness={.6} metalness={.35} /></mesh>
        {[0, 1, 2].map((index) => (
          <mesh key={index} castShadow position={[Math.cos((index / 3) * Math.PI * 2) * .22, .06, Math.sin((index / 3) * Math.PI * 2) * .22]}>
            <boxGeometry args={[.06, .12, .06]} />
            <meshStandardMaterial color={STEEL} roughness={.6} metalness={.35} />
          </mesh>
        ))}
        <SiteBrazier />
        <group position={[0, .5, 0]}><SmokePlume tint="#cbbba4" scale={.7} /></group>
        {[[-.95, .3], [.95, -.25]].map(([x, z], index) => (
          <mesh key={index} castShadow position={[x, .17, z]}>
            <boxGeometry args={[.8, .1, .3]} />
            <meshStandardMaterial color={WOOD_LIGHT} roughness={.9} />
          </mesh>
        ))}
      </group>
      {/* Crew pickup parked along the far edge, clear of the district's tree */}
      <PickupTruck position={[3.3, 0, .7]} rotation={Math.PI / 2} color="#3f7fa8" />
      <Wheelbarrow position={[-1.7, 0, 1.3]} rotation={-.5} />
    </group>
  );
}

function SiteBrazier() {
  const flame = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!flame.current) return;
    const time = clock.getElapsedTime();
    flame.current.scale.set(1 + Math.sin(time * 7) * .1, 1 + Math.sin(time * 9.3) * .18, 1 + Math.cos(time * 8.1) * .1);
  });
  return (
    <group ref={flame} position={[0, .42, 0]}>
      <mesh><coneGeometry args={[.15, .34, 7]} /><meshBasicMaterial color="#e8862c" transparent opacity={.9} /></mesh>
      <mesh position={[0, .06, 0]}><coneGeometry args={[.08, .22, 7]} /><meshBasicMaterial color="#f5d24a" /></mesh>
      <pointLight color="#ff9a3c" intensity={2.4} distance={3.4} position={[0, .12, 0]} />
    </group>
  );
}
