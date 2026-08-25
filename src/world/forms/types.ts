import type { WorldEntity } from "../entities/world-entity";

export type FormFeedState = "available" | "empty" | "permission_denied" | "unsupported" | "error";

export interface FormFeed {
  state: FormFeedState;
  entities: WorldEntity[];
  total: number;
  limit: number;
  /** True when a refresh failed and the last known records are still shown. */
  stale?: boolean;
  error?: string;
  httpStatus?: number;
}
