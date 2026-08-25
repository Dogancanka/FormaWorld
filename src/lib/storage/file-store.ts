import "server-only";

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

/**
 * A JSON file store, deliberately the smallest thing that survives a restart.
 *
 * FormaWorld itself stores no project data — the world is read from APS on every
 * reconciliation. What it does have to remember is what belongs to the *reader*:
 * their XP, the digest lines they have already answered, and the snapshot their
 * last visit ended on, without which "while you were away" cannot be a diff.
 * That is a few hundred bytes per reader per project, so a database would be
 * more operational surface than the data deserves.
 *
 * Set `FORMAWORLD_DATA_DIR` to move it. The default lives beside the app and is
 * gitignored; on Docker it is the mounted volume.
 */
const DEFAULT_DIR = "data";

export function dataDir(): string {
  return resolve(process.env.FORMAWORLD_DATA_DIR ?? DEFAULT_DIR);
}

/**
 * Keys come from Autodesk identifiers and reader IDs, which may hold anything.
 * They are hashed rather than escaped, so no key can ever climb out of the data
 * directory or collide with another after some clever normalisation.
 */
function pathForKey(namespace: string, key: string): string {
  if (!/^[a-z0-9-]{1,32}$/.test(namespace)) {
    throw new Error(`Unsafe storage namespace: ${namespace}`);
  }
  const digest = createHash("sha256").update(key).digest("hex");
  return join(dataDir(), namespace, digest.slice(0, 2), `${digest}.json`);
}

/**
 * One in-flight write per file. Two browser tabs acknowledging digest lines at
 * the same moment would otherwise interleave read-modify-write and lose one of
 * them; the queue makes the second wait for the first.
 */
const writeQueue = new Map<string, Promise<unknown>>();

function enqueue<T>(file: string, operation: () => Promise<T>): Promise<T> {
  const previous = writeQueue.get(file) ?? Promise.resolve();
  const next = previous.then(operation, operation);
  writeQueue.set(file, next.catch(() => undefined));
  return next;
}

export async function readRecord<T>(namespace: string, key: string): Promise<T | undefined> {
  const file = pathForKey(namespace, key);
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (cause) {
    // A missing file is the normal first-visit case. Anything else — corrupt
    // JSON, a permission problem — must not take the world down with it, so it
    // is reported as "nothing stored" and the reader starts fresh.
    if ((cause as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`[storage] could not read ${namespace}:`, cause);
    }
    return undefined;
  }
}

export async function writeRecord(namespace: string, key: string, value: unknown): Promise<void> {
  const file = pathForKey(namespace, key);
  await enqueue(file, async () => {
    await mkdir(dirname(file), { recursive: true });
    // Write beside the target and rename over it, so a crash mid-write leaves
    // the previous version intact instead of a truncated file.
    const temporary = `${file}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(value), "utf8");
    await rename(temporary, file);
  });
}

/** Read, transform, and write back under the same lock. */
export async function updateRecord<T>(
  namespace: string,
  key: string,
  update: (current: T | undefined) => T,
): Promise<T> {
  const file = pathForKey(namespace, key);
  return enqueue(file, async () => {
    let current: T | undefined;
    try {
      current = JSON.parse(await readFile(file, "utf8")) as T;
    } catch {
      current = undefined;
    }
    const next = update(current);
    await mkdir(dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(next), "utf8");
    await rename(temporary, file);
    return next;
  });
}
