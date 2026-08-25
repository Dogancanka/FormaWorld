import type { WorldEntity } from "../entities/world-entity";

export type RfiFeedState = "available" | "empty" | "permission_denied" | "unsupported" | "error";

export interface RfiFeed {
  state: RfiFeedState;
  entities: WorldEntity[];
  total: number;
  limit: number;
  /** True when a refresh failed and the last known records are still shown. */
  stale?: boolean;
  error?: string;
  httpStatus?: number;
}
