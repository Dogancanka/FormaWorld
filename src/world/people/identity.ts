import type { WorldEntity } from "../entities/world-entity";

// A crew member must look like the same person in every project world. APS gives
// each project its own membership record, so the project-scoped `id` is useless
// as an identity: the same human has a different one in project A and project B.
// The appearance is therefore derived from the account-level identifiers first
// and only falls back to the project record when nothing stable is available.

export interface PersonAppearance {
  /** The identifier the appearance was derived from — shown for traceability. */
  key: string;
  /** True when the key is stable across projects (account id or email). */
  stable: boolean;
  vest: string;
  sleeves: string;
  trousers: string;
  helmet: string;
  skin: string;
  /** Deterministic body variant, 0-2. */
  build: number;
  /** Deterministic idle behaviour, 0-2. */
  idle: number;
}

const VESTS: [string, string][] = [
  ["#e4a72c", "#3d5c7a"],
  ["#d9722f", "#38504a"],
  ["#cfc23f", "#4a4038"],
  ["#e08a3c", "#2f4756"],
  ["#c9d045", "#4b3f52"],
  ["#dd9a35", "#3b4a3a"],
  ["#e2b64a", "#59433a"],
  ["#d8842c", "#37424f"],
];
const TROUSERS = ["#3b4550", "#4a4038", "#33463a", "#463a4e", "#2f4048", "#54463a"];
const HELMETS = ["#e6b93f", "#d95f3c", "#4d84b8", "#e9e4d8", "#5f9668", "#c96f9c"];
const SKINS = ["#8d5b3e", "#b87955", "#c7926d", "#d8a47f", "#e0b493", "#70452f"];

export function hashIdentity(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function rawRecord(entity: WorldEntity): Record<string, unknown> {
  const raw = entity.metadata?.raw;
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
}

function text(record: Record<string, unknown>, key: string): string | undefined {
  const candidate = record[key];
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : undefined;
}

/**
 * The identifier an avatar is generated from. `autodeskId` is the same account
 * across every project, `email` is the next best account-level identifier, and
 * the project membership id is the last resort.
 */
export function personIdentityKey(entity: WorldEntity): { key: string; stable: boolean } {
  const record = rawRecord(entity);
  const autodeskId = text(record, "autodeskId");
  if (autodeskId) return { key: `autodesk:${autodeskId.toLowerCase()}`, stable: true };
  const email = text(record, "email");
  if (email) return { key: `email:${email.toLowerCase()}`, stable: true };
  return { key: `member:${entity.externalId}`, stable: false };
}

export function personAppearance(entity: WorldEntity): PersonAppearance {
  const { key, stable } = personIdentityKey(entity);
  const hash = hashIdentity(key);
  const [vest, sleeves] = VESTS[hash % VESTS.length];
  return {
    key,
    stable,
    vest,
    sleeves,
    trousers: TROUSERS[(hash >>> 4) % TROUSERS.length],
    helmet: HELMETS[(hash >>> 9) % HELMETS.length],
    skin: SKINS[(hash >>> 14) % SKINS.length],
    build: (hash >>> 19) % 3,
    idle: (hash >>> 23) % 3,
  };
}
