import type { WorldEntity, WorldEntityType } from "../entities";

export type WorldActionKind = "set_status" | "submit_form";

export type WorldActionOption = {
  value: string;
  label: string;
};

export type WorldActionCapability = {
  kind: WorldActionKind;
  label: string;
  description: string;
  fieldLabel: string;
  currentValue?: string;
  options: WorldActionOption[];
  destructive?: boolean;
};

export type WorldActionOptions = {
  state: "available" | "read_only" | "unsupported" | "error";
  entityType: WorldEntityType;
  entityId: string;
  writeScopeGranted: boolean;
  capabilities: WorldActionCapability[];
  error?: string;
};

export type ExecuteWorldActionInput = {
  entityType: "asset" | "issue" | "form";
  entityId: string;
  kind: WorldActionKind;
  value: string;
};

export type ExecuteWorldActionResult = {
  entity: WorldEntity;
  confirmedByAps: true;
};
