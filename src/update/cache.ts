import { readJsonSafe, updateCheckPath, writeJsonAtomic } from '../daemon/state.js';
import { isValidVersion } from './semver.js';

export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * What the background server learned, and what the CLI has already told the
 * user. Every field is re-validated on read: the file is private to the user
 * but a stray edit must not be able to put anything but a version number in
 * their terminal.
 */
export interface UpdateCache {
  checkedAt: number;
  latest: string;
  notifiedFor?: string;
  notifiedAt?: number;
}

function isTimestamp(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

export function readUpdateCache(file: string = updateCheckPath()): UpdateCache | null {
  const raw = readJsonSafe(file);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (!isTimestamp(r.checkedAt) || !isValidVersion(r.latest)) return null;
  const cache: UpdateCache = { checkedAt: r.checkedAt, latest: r.latest };
  if (isValidVersion(r.notifiedFor) && isTimestamp(r.notifiedAt)) {
    cache.notifiedFor = r.notifiedFor;
    cache.notifiedAt = r.notifiedAt;
  }
  return cache;
}

/** Record a fresh answer, keeping what the CLI has already said about earlier ones. */
export function recordCheck(
  latest: string,
  now: number,
  file: string = updateCheckPath(),
): void {
  const previous = readUpdateCache(file);
  const next: UpdateCache = { checkedAt: now, latest };
  if (previous?.notifiedFor !== undefined && previous.notifiedAt !== undefined) {
    next.notifiedFor = previous.notifiedFor;
    next.notifiedAt = previous.notifiedAt;
  }
  writeJsonAtomic(file, next);
}

/**
 * Patch only the notified fields onto what is on disk, so a check the server
 * recorded a moment ago is not overwritten with an older `latest`.
 */
export function recordNotified(
  version: string,
  now: number,
  file: string = updateCheckPath(),
): void {
  const current = readUpdateCache(file);
  if (!current) return;
  writeJsonAtomic(file, { ...current, notifiedFor: version, notifiedAt: now });
}

/** A recorded check older than a day, or dated in the future, is due again. */
export function isCheckDue(cache: UpdateCache | null, now: number): boolean {
  if (!cache) return true;
  return cache.checkedAt > now || now - cache.checkedAt >= DAY_MS;
}

/** The same version is announced at most once a day. */
export function wasRecentlyNotified(cache: UpdateCache, now: number): boolean {
  if (cache.notifiedFor !== cache.latest || cache.notifiedAt === undefined) return false;
  return cache.notifiedAt <= now && now - cache.notifiedAt < DAY_MS;
}
