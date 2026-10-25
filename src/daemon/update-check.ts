import { isCheckDue, readUpdateCache, recordCheck } from '../update/cache.js';
import { UpdateCheckError } from '../update/latest.js';

/** How often to look at whether a check is due; the check itself runs about daily. */
const POLL_MS = 60 * 60 * 1000;

export interface UpdateCheckerDeps {
  /** Re-read on every tick so `mdview config update-check` takes effect without a restart. */
  isEnabled: () => Promise<boolean>;
  fetchLatest: () => Promise<string>;
  now: () => number;
  log: (message: string) => void;
  cacheFile?: string;
  pollMs?: number;
}

export type TickOutcome = 'disabled' | 'fresh' | 'busy' | 'checked' | 'failed';

export interface UpdateChecker {
  tick: () => Promise<TickOutcome>;
  /** Check now, then keep checking on the poll interval. */
  start: () => void;
  stop: () => void;
}

/**
 * The opt-in daily registry check. It lives in the long-running server so the
 * short CLI commands never make a network call. Polling hourly rather than
 * sleeping a day is what lets a user who just turned it on get a first answer
 * soon, and what makes a server that restarts often respect the cache instead
 * of asking again each time.
 */
export function createUpdateChecker(deps: UpdateCheckerDeps): UpdateChecker {
  let running = false;

  const tick = async (): Promise<TickOutcome> => {
    if (running) return 'busy';
    running = true;
    try {
      if (!(await deps.isEnabled())) return 'disabled';
      const now = deps.now();
      if (!isCheckDue(readUpdateCache(deps.cacheFile), now)) return 'fresh';
      const latest = await deps.fetchLatest();
      recordCheck(latest, now, deps.cacheFile);
      return 'checked';
    } catch (err) {
      // Failures stay in the log: the user asked for a quiet daily nudge, not
      // for errors about a network they may not have right now.
      deps.log(
        `update check failed: ${err instanceof UpdateCheckError ? err.message : 'unexpected error'}`,
      );
      return 'failed';
    } finally {
      running = false;
    }
  };

  let timer: ReturnType<typeof setInterval> | undefined;
  return {
    tick,
    start: () => {
      if (timer) return;
      void tick();
      timer = setInterval(() => void tick(), deps.pollMs ?? POLL_MS);
      timer.unref();
    },
    stop: () => {
      if (timer) clearInterval(timer);
      timer = undefined;
    },
  };
}
