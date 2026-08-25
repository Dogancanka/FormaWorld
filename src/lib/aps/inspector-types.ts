export type DataSourceId = "documents" | "issues" | "assets" | "forms" | "people";
export type DataSourceState =
  | "loading"
  | "available"
  | "empty"
  | "permission_denied"
  | "unsupported"
  | "error";

export interface InspectorItem {
  id: string;
  title: string;
  details: Array<{ label: string; value: string }>;
}

export interface DataSourceResult {
  id: DataSourceId;
  state: Exclude<DataSourceState, "loading">;
  count: number;
  summary: string;
  items: InspectorItem[];
  error?: string;
  httpStatus?: number;
}

export type InspectorResults = Record<DataSourceId, DataSourceResult>;
