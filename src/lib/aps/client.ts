import "server-only";

import { APS_API_BASE_URL, getApsConfig } from "./config";
import { refreshAccessToken } from "./oauth";
import type {
  ApsCollection,
  ApsHub,
  ApsProject,
  HubSummary,
  ProjectSummary,
} from "./types";
import { getSession } from "../session";

export class ApsApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApsApiError";
  }
}

export async function getValidAccessToken(): Promise<string> {
  const session = await getSession();
  if (!session.accessToken || !session.expiresAt) {
    throw new ApsApiError("Autodesk session is missing. Sign in again.", 401);
  }

  if (session.expiresAt > Date.now() + 60_000) return session.accessToken;
  if (!session.refreshToken) {
    throw new ApsApiError("Autodesk session expired. Sign in again.", 401);
  }

  try {
    const tokens = await refreshAccessToken(getApsConfig(), session.refreshToken);
    session.accessToken = tokens.access_token;
    session.refreshToken = tokens.refresh_token ?? session.refreshToken;
    session.expiresAt = Date.now() + tokens.expires_in * 1000;
    if (tokens.scope) session.grantedScopes = tokens.scope.split(/\s+/).filter(Boolean);
    await session.save();
    return tokens.access_token;
  } catch (error) {
    session.destroy();
    throw error;
  }
}

function nextLink(value: ApsCollection<unknown>["links"]): string | undefined {
  const next = value?.next;
  return typeof next === "string" ? next : next?.href;
}

async function getCollection<T>(path: string): Promise<T[]> {
  const token = await getValidAccessToken();
  const resources: T[] = [];
  let url: string | undefined = new URL(path, APS_API_BASE_URL).toString();

  // APS paginates these collections. The cap prevents an unexpected infinite
  // pagination chain while still supporting normal multi-page accounts.
  for (let page = 0; url && page < 25; page += 1) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.api+json" },
      cache: "no-store",
    });
    if (!response.ok) {
      const details = await response.text();
      throw new ApsApiError(
        `APS request failed (${response.status}): ${details || response.statusText}`,
        response.status,
      );
    }
    const payload = (await response.json()) as ApsCollection<T>;
    resources.push(...payload.data);
    url = nextLink(payload.links);
  }
  return resources;
}

/**
 * Statuses that mean "the gateway gave up", not "your request was wrong". They
 * are worth retrying; a 401, 403 or 404 never is.
 */
const TRANSIENT_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const REQUEST_TIMEOUT_MS = 25_000;
// One retry, not a chain: callers that also fall back to a smaller page would
// otherwise turn a slow endpoint into a very long reconciliation.
const RETRY_DELAYS_MS = [800];

export function isTransientApsError(cause: unknown): boolean {
  return cause instanceof ApsApiError && TRANSIENT_STATUSES.has(cause.status);
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function requestApsJson<T>(
  path: string,
  accessToken?: string,
): Promise<T> {
  const token = accessToken ?? (await getValidAccessToken());
  const url = new URL(path, APS_API_BASE_URL);
  if (url.origin !== APS_API_BASE_URL) {
    throw new ApsApiError("Refused an APS request outside the configured API host.", 500);
  }

  // A slow APS service was returning 504 for a whole district. A bounded retry
  // rides out a transient gateway failure, and an explicit timeout stops one
  // hanging request from holding up every other feed in the reconciliation.
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json, application/vnd.api+json",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        const details = await response.text();
        throw new ApsApiError(
          `APS request failed (${response.status}): ${details || response.statusText}`,
          response.status,
        );
      }
      return await response.json() as T;
    } catch (cause) {
      lastError = cause instanceof ApsApiError
        ? cause
        : new ApsApiError(
          cause instanceof Error && cause.name === "TimeoutError"
            ? `APS request timed out after ${REQUEST_TIMEOUT_MS / 1000}s.`
            : `APS request failed: ${cause instanceof Error ? cause.message : "unknown network error"}`,
          504,
        );
      if (attempt === RETRY_DELAYS_MS.length || !isTransientApsError(lastError)) break;
      console.info(`APS retry ${attempt + 1} for ${url.pathname} after ${(lastError as ApsApiError).status}.`);
      await wait(RETRY_DELAYS_MS[attempt]);
    }
  }
  throw lastError;
}

export async function mutateApsJson<T>(
  path: string,
  method: "POST" | "PATCH",
  body: unknown,
  accessToken?: string,
): Promise<T> {
  const token = accessToken ?? (await getValidAccessToken());
  const url = new URL(path, APS_API_BASE_URL);
  if (url.origin !== APS_API_BASE_URL) {
    throw new ApsApiError("Refused an APS mutation outside the configured API host.", 500);
  }
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) {
    const details = await response.text();
    throw new ApsApiError(
      `APS mutation failed (${response.status}): ${details || response.statusText}`,
      response.status,
    );
  }
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export async function listHubs(): Promise<HubSummary[]> {
  const hubs = await getCollection<ApsHub>("/project/v1/hubs");
  return hubs.map((hub) => ({
    id: hub.id,
    name: hub.attributes.displayName ?? hub.attributes.name ?? "Autodesk hub",
    kind: hub.attributes.extension?.type,
  }));
}

export async function listProjects(hubId: string): Promise<ProjectSummary[]> {
  const projects = await getCollection<ApsProject>(
    `/project/v1/hubs/${encodeURIComponent(hubId)}/projects`,
  );
  return projects.map((project) => ({
    id: project.id,
    name: project.attributes.displayName ?? project.attributes.name ?? "Autodesk project",
    kind: project.attributes.extension?.type,
  }));
}
