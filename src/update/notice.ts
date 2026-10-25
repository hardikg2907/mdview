import { readUpdateCache, recordNotified, wasRecentlyNotified } from './cache.js';
import { isNewerVersion } from './semver.js';

export interface NoticeDeps {
  version: string;
  now: () => number;
  /** True only when a person is looking: both streams are terminals. */
  interactive: () => boolean;
  isEnabled: () => Promise<boolean>;
  print: (line: string) => void;
  cacheFile?: string;
}

/**
 * Tell the user, in one stderr line, that a newer release exists. Reads only
 * the local cache the background server filled in, so it never touches the
 * network and never delays the command. Silent on every failure: a missing
 * notice is better than a broken command.
 */
export async function printUpdateNotice(deps: NoticeDeps): Promise<void> {
  try {
    if (!deps.interactive()) return;
    if (!(await deps.isEnabled())) return;
    const cache = readUpdateCache(deps.cacheFile);
    if (!cache || !isNewerVersion(cache.latest, deps.version)) return;
    const now = deps.now();
    if (wasRecentlyNotified(cache, now)) return;
    deps.print(
      `mdview ${cache.latest} is available — run \`mdview update\` for the install command.`,
    );
    recordNotified(cache.latest, now, deps.cacheFile);
  } catch {
    // Nothing here is worth failing the user's command over.
  }
}
