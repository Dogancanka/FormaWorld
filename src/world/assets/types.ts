import type { WorldEntity } from "../entities/world-entity";
import type { AssetStatusOption } from "../zones";
import type { AssetCategoryOption } from "./materials";

export type AssetFeedState = "available" | "empty" | "permission_denied" | "unsupported" | "error";

export interface AssetFeed {
  state: AssetFeedState;
  entities: WorldEntity[];
  total: number;
  limit: number;
  /** The project's own APS asset statuses; one world district per entry. */
  statuses: AssetStatusOption[];
  /** The project's own APS asset categories; they decide how material looks. */
  categories: AssetCategoryOption[];
  /** True when a refresh failed and the last known records are still shown. */
  stale?: boolean;
  error?: string;
  httpStatus?: number;
}
