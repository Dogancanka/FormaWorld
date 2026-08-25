export type ZoneKind = "project" | "documents" | "issues" | "rfis" | "forms" | "people" | "assets";

export type ZoneId = string;

export interface WorldZone {
  id: ZoneId;
  kind: ZoneKind;
  label: string;
  shortLabel: string;
  description: string;
  position: [number, number, number];
  size: [number, number];
  color: string;
}

export interface AssetStatusOption {
  id: string;
  label: string;
}

/** The single asset district. Statuses are lanes inside it, not districts. */
export const ASSET_ZONE: ZoneId = "assets";

// The non-asset districts are the same in every project world, so a person who
// knows one project already knows where to look.
const CORE_ZONES: WorldZone[] = [
  {
    id: "hub",
    kind: "project",
    label: "Project",
    shortLabel: "Project",
    description: "The project overview at the centre of the site and the navigation point for the live world.",
    position: [0, 0, 0],
    size: [6.0, 5.4],
    color: "#e0673d",
  },
  {
    id: "documents",
    kind: "documents",
    label: "Documents",
    shortLabel: "Documents",
    description: "Real project folders, drawings, and files from Autodesk Docs.",
    position: [-12.0, 0, -9.0],
    size: [7.0, 5.6],
    color: "#3f8fd4",
  },
  {
    id: "rfis",
    kind: "rfis",
    label: "RFIs",
    shortLabel: "RFIs",
    description: "Real project requests for information and their current Autodesk status.",
    position: [-2.5, 0, -9.0],
    size: [7.6, 6.2],
    color: "#9b6fd4",
  },
  {
    id: "issues",
    kind: "issues",
    label: "Issues",
    shortLabel: "Issues",
    description: "Real project issues, grouped by their current Autodesk status.",
    position: [11.5, 0, -9.0],
    size: [14.0, 9.2],
    color: "#e2452f",
  },
  {
    id: "forms",
    kind: "forms",
    label: "Forms",
    shortLabel: "Forms",
    description: "Real project forms, checklists, and inspections.",
    position: [-12.0, 0, 1.0],
    size: [6.2, 5.6],
    color: "#3faa78",
  },
  {
    id: "people",
    kind: "people",
    label: "Project Members",
    shortLabel: "Members",
    description: "The real project members, companies, and teams on this project.",
    position: [11.0, 0, 1.0],
    size: [9.0, 7.2],
    color: "#f0b429",
  },
];

export function coreZones(): WorldZone[] {
  return CORE_ZONES.map((zone) => ({ ...zone, position: [...zone.position] as [number, number, number] }));
}

/** Where the Material Yard sits; its width follows the project's status count. */
const ASSET_YARD_POSITION: [number, number, number] = [0, 0, 11.5];

/**
 * The districts for one project. There is one asset district, not one per
 * status: a project's asset workflow is a single yard read left to right, so a
 * status change moves an asset along that yard instead of to another district.
 * The yard's width comes from the layout, which knows how many lanes the
 * project's own APS statuses need.
 */
export function worldZones(assetYardSize: [number, number] = [24, 9.4]): WorldZone[] {
  return [
    ...coreZones(),
    {
      id: ASSET_ZONE,
      kind: "assets",
      label: "Assets",
      shortLabel: "Assets",
      description: "Real project assets, laid out along the project's own Autodesk status workflow: material arrives at the intake end, waits in the lane for its current status, and leaves from the dispatch end.",
      position: [...ASSET_YARD_POSITION] as [number, number, number],
      size: [...assetYardSize] as [number, number],
      color: "#4fa3c7",
    },
  ];
}
