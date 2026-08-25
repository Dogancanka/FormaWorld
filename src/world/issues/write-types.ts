import type { WorldEntity } from "../entities";

export interface IssueSubtypeOption {
  id: string;
  title: string;
  parentTitle?: string;
}

export interface IssueCreateOptions {
  state: "available" | "empty" | "permission_denied" | "error";
  subtypes: IssueSubtypeOption[];
  writeScopeGranted: boolean;
  error?: string;
  httpStatus?: number;
}

export interface CreateIssueInput {
  title: string;
  description?: string;
  issueSubtypeId: string;
  assignedTo?: string;
  assignedToType?: "user";
}

export interface CreateIssueResult {
  issue: WorldEntity;
  confirmedByAps: true;
}
