import type { WorldEntity } from "../entities/world-entity";

export type DocumentFeedState = "available" | "empty" | "permission_denied" | "unsupported" | "error";

export interface DocumentFeed {
  state: DocumentFeedState;
  entities: WorldEntity[];
  total: number;
  limit: number;
  scope: string;
  /** True when a refresh failed and the last known records are still shown. */
  stale?: boolean;
  error?: string;
  httpStatus?: number;
}
