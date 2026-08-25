import type { CreateIssueInput } from "./write-types";

export function requestHasSameOrigin(requestUrl: string, origin: string | null): boolean {
  return Boolean(origin && origin === new URL(requestUrl).origin);
}

export function validateCreateIssueInput(value: unknown): CreateIssueInput | undefined {
  if (!value || typeof value !== "object") return undefined;
  const body = value as Record<string, unknown>;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : undefined;
  const issueSubtypeId = typeof body.issueSubtypeId === "string" ? body.issueSubtypeId.trim() : "";
  const assignedTo = typeof body.assignedTo === "string" ? body.assignedTo.trim() : undefined;
  if (!title || title.length > 200 || !issueSubtypeId || (description?.length ?? 0) > 5000) return undefined;
  return { title, description, issueSubtypeId, assignedTo, assignedToType: assignedTo ? "user" : undefined };
}
