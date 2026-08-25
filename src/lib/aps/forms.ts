import "server-only";

import { ApsApiError, getValidAccessToken, mutateApsJson, requestApsJson } from "./client";
import { projectUuid } from "./project-id";
import type { SelectedProject } from "../session";
import { adaptApsForm } from "@/world/adapters";
import { apsCollection, apsTotal, describeCollection } from "./collection";
import type { ApsRecord, WorldEntity } from "@/world/entities";
import type { WorldActionCapability } from "@/world/actions/types";

type JsonObject = Record<string, unknown>;
const FORM_LIMIT = 25;

export async function listWorldForms(project: SelectedProject): Promise<{
  entities: WorldEntity[];
  total: number;
  limit: number;
}> {
  const token = await getValidAccessToken();
  const id = encodeURIComponent(projectUuid(project.id));
  const payload = await requestApsJson<JsonObject>(
    `/construction/forms/v2/projects/${id}/forms?limit=${FORM_LIMIT}&offset=0`,
    token,
  );
  const collection = apsCollection(payload, "data", "results", "forms");
  const total = apsTotal(payload, collection.records.length);
  console.info(describeCollection("APS Forms page", collection, total));
  const entities = collection.records.map((raw): WorldEntity => ({
    ...adaptApsForm(raw, { projectId: project.id }),
    zone: "forms",
  }));
  return { entities, total, limit: FORM_LIMIT };
}

async function findForm(project: SelectedProject, formId: string): Promise<ApsRecord> {
  const token = await getValidAccessToken();
  const id = encodeURIComponent(projectUuid(project.id));
  const payload = await requestApsJson<JsonObject>(`/construction/forms/v2/projects/${id}/forms?limit=${FORM_LIMIT}&offset=0`, token);
  const raw = apsCollection(payload, "data", "results", "forms").records.find((form) => form.id === formId);
  if (!raw) throw new ApsApiError("The form is no longer present in the loaded APS form set.", 404);
  return raw;
}

export async function getFormSubmitCapability(project: SelectedProject, formId: string): Promise<{ raw: ApsRecord; capability?: WorldActionCapability }> {
  const raw = await findForm(project, formId);
  const status = typeof raw.status === "string" ? raw.status : undefined;
  const templateId = typeof raw.templateId === "string" ? raw.templateId : undefined;
  const alreadySubmitted = status?.toLowerCase() === "submitted";
  return {
    raw,
    capability: templateId && !alreadySubmitted ? {
      kind: "submit_form",
      label: "Submit form",
      description: "Submit this live form to its Autodesk project workflow.",
      fieldLabel: "New status",
      currentValue: status,
      options: [{ value: "submitted", label: "Submitted" }],
    } : undefined,
  };
}

export async function submitWorldForm(project: SelectedProject, formId: string): Promise<WorldEntity> {
  const before = await getFormSubmitCapability(project, formId);
  const templateId = typeof before.raw.templateId === "string" ? before.raw.templateId : undefined;
  if (!templateId || !before.capability) throw new ApsApiError("This form cannot be submitted from the current workflow state.", 400);
  const token = await getValidAccessToken();
  const id = encodeURIComponent(projectUuid(project.id));
  await mutateApsJson<unknown>(
    `/construction/forms/v1/projects/${id}/form-templates/${encodeURIComponent(templateId)}/forms/${encodeURIComponent(formId)}`,
    "PATCH",
    { status: "submitted" },
    token,
  );
  const raw = await findForm(project, formId);
  return { ...adaptApsForm(raw, { projectId: project.id }), zone: "forms" };
}
