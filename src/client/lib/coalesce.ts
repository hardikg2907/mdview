/**
 * Runs an async `task` at most once per burst of `request()` calls.
 *
 * A request waits `delayMs` after the last one before the task starts. A request
 * that lands while the task is running is not dropped and does not start a second
 * concurrent run: exactly one follow-up runs once the current one settles, so the
 * state the task refreshes always reflects the last request.
 */
export interface Coalesced {
  request: () => void;
  cancel: () => void;
}

export function coalesce(task: () => Promise<unknown>, delayMs: number): Coalesced {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;
  let dirty = false;

  async function run(): Promise<void> {
    dirty = false;
    inFlight = true;
    try {
      await task();
    } catch {
      // A failed refresh is retried by the next request; there is no caller to tell.
    } finally {
      inFlight = false;
      // A pending timer will start the follow-up itself; starting one here too
      // would run the task twice for the same burst.
      if (dirty && timer === null) void run();
    }
  }

  function fire(): void {
    timer = null;
    if (inFlight || !dirty) return;
    void run();
  }

  return {
    request() {
      dirty = true;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(fire, delayMs);
    },
    cancel() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      dirty = false;
    },
  };
}
