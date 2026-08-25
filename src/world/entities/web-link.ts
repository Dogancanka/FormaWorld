import type { WorldEntity } from "./world-entity";

/**
 * The Autodesk web page for a record, when APS told us where it is.
 *
 * The link is *read*, never constructed. Deep-link URLs for Issues, Forms, RFIs
 * and Assets are not publicly documented, and the host differs by region, so
 * assembling one from a pattern would produce a link that quietly 404s for some
 * accounts — worse than showing none, because a broken link in a panel that
 * otherwise only shows verified data undoes the point of the panel. Data
 * Management answers with a JSON:API `links.webView`, and any module that does
 * the same is picked up here for free.
 *
 * Every candidate is checked before it is offered:
 *
 * - it must parse as an absolute URL;
 * - it must be `https`;
 * - its host must be an Autodesk one.
 *
 * That last rule matters. These values come out of project data, and a record
 * whose title or custom field happens to hold a URL must never become a link
 * this application invites someone to click.
 */

const ALLOWED_HOSTS = [
  "autodesk.com",
  "autodesk.eu",
  "autodesk.co.uk",
  "autodesk.com.au",
  "bim360.com",
];

/** Fields APS is known to answer with, in the order they are trusted. */
const LINK_PATHS = [
  ["links", "webView", "href"],
  ["links", "web", "href"],
  ["webView", "href"],
  ["webViewLink"],
  ["webUrl"],
  ["permalink"],
] as const;

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function at(source: Record<string, unknown>, path: readonly string[]): unknown {
  let cursor: unknown = source;
  for (const key of path) {
    const step = record(cursor);
    if (!step) return undefined;
    cursor = step[key];
  }
  return cursor;
}

/** True when the host is Autodesk's, including its subdomains. */
export function isAutodeskUrl(candidate: string): boolean {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  return ALLOWED_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

export function recordWebLink(entity: WorldEntity): string | undefined {
  const raw = record(entity.metadata?.raw);
  if (!raw) return undefined;
  for (const path of LINK_PATHS) {
    const candidate = at(raw, path);
    if (typeof candidate !== "string" || !candidate.trim()) continue;
    const trimmed = candidate.trim();
    if (isAutodeskUrl(trimmed)) return trimmed;
  }
  return undefined;
}
