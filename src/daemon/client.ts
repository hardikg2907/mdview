import { type ChildProcess, spawn } from 'node:child_process';
import { closeSync, openSync, statSync, truncateSync } from 'node:fs';
import {
  clearDaemonState,
  type DaemonState,
  daemonLogPath,
  readDaemonState,
  releaseSpawnLock,
  tryTakeSpawnLock,
} from './state.js';

const HEALTH_TIMEOUT_MS = 500;
const START_TIMEOUT_MS = 8_000;
const POLL_INTERVAL_MS = 50;
/** Keep the log from growing without bound across many daemon lifetimes. */
const LOG_TRUNCATE_BYTES = 1024 * 1024;

export interface Health {
  pid: number;
  startedAt: number;
  roots: string[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Ask whatever is on `port` to identify itself. Null for anything unexpected. */
export async function probeHealth(port: number): Promise<Health | null> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as Partial<Health>;
    if (typeof body.pid !== 'number' || typeof body.startedAt !== 'number') return null;
    return {
      pid: body.pid,
      startedAt: body.startedAt,
      roots: Array.isArray(body.roots) ? body.roots.filter((r) => typeof r === 'string') : [],
    };
  } catch {
    // Refused, timed out, not our JSON — all mean "no daemon of ours there".
    return null;
  }
}

/**
 * Find the running daemon, if the recorded one is really ours.
 *
 * Both pid and startedAt must match what we wrote. A pid alone is not enough:
 * the OS reuses pids, so a stale state file can name a live process that has
 * nothing to do with mdview — and we must never signal that one.
 */
export async function findLiveDaemon(): Promise<{ state: DaemonState; health: Health } | null> {
  const state = readDaemonState();
  if (!state) return null;
  const health = await probeHealth(state.port);
  if (!health) return null;
  if (health.pid !== state.pid || health.startedAt !== state.startedAt) return null;
  return { state, health };
}

function spawnDaemon(cliEntry: string): ChildProcess {
  try {
    if (statSync(daemonLogPath()).size > LOG_TRUNCATE_BYTES) {
      truncateSync(daemonLogPath(), 0);
    }
  } catch {
    // No log yet, or not truncatable. Either way, carry on.
  }
  const log = openSync(daemonLogPath(), 'a');
  try {
    const child = spawn(process.execPath, [cliEntry, '--daemon'], {
      detached: true,
      // Nothing may hold the terminal: stdout and stderr go to the log so the
      // parent can exit while the daemon keeps running.
      stdio: ['ignore', log, log],
    });
    child.unref();
    return child;
  } finally {
    closeSync(log);
  }
}

/**
 * Return the running daemon, starting one if there isn't a live one.
 *
 * The spawn is serialised through a lock file so two shells running `mdview` at
 * the same moment end up sharing one daemon rather than racing for the port.
 */
export async function ensureDaemon(cliEntry: string): Promise<DaemonState> {
  const existing = await findLiveDaemon();
  if (existing) return existing.state;

  if (!tryTakeSpawnLock()) {
    // Someone else is mid-spawn; wait for their daemon instead of making a second.
    const found = await waitFor(() => findLiveDaemon(), START_TIMEOUT_MS);
    if (found) return found.state;
    throw new Error('Timed out waiting for the mdview background server to start.');
  }

  try {
    // A state file left behind by a killed daemon would otherwise be mistaken
    // for the one we are about to start.
    clearDaemonState();
    spawnDaemon(cliEntry);
    const found = await waitFor(() => findLiveDaemon(), START_TIMEOUT_MS);
    if (!found) {
      throw new Error(
        `The mdview background server did not start. See ${daemonLogPath()} for why.`,
      );
    }
    return found.state;
  } finally {
    releaseSpawnLock();
  }
}

async function waitFor<T>(attempt: () => Promise<T | null>, timeoutMs: number): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await attempt();
    if (result) return result;
    if (Date.now() >= deadline) return null;
    await sleep(POLL_INTERVAL_MS);
  }
}

/**
 * Wait until the daemon reports the root as open.
 *
 * The CLI writes the workspace file and the daemon picks the change up through
 * a watcher, so without this the browser can open a deep link before the root
 * it names exists and get a 404 for no visible reason.
 */
export async function waitForRoot(port: number, rootId: string, timeoutMs = 3_000): Promise<boolean> {
  const found = await waitFor(async () => {
    const health = await probeHealth(port);
    return health?.roots.includes(rootId) ? health : null;
  }, timeoutMs);
  return found !== null;
}

export type StopOutcome =
  | { kind: 'stopped'; pid: number }
  | { kind: 'not-running' }
  | { kind: 'stale' };

/** Stop the daemon, but only once it has proved it is ours. */
export async function stopDaemon(): Promise<StopOutcome> {
  const state = readDaemonState();
  if (!state) return { kind: 'not-running' };
  const live = await findLiveDaemon();
  if (!live) {
    // The port is silent or answered as somebody else. Clear our note and
    // signal nothing — the pid may now belong to an unrelated process.
    clearDaemonState();
    return { kind: 'stale' };
  }
  try {
    // SIGTERM does not exist on Windows; an argument-less kill() terminates the
    // process through the platform-native mechanism instead.
    if (process.platform === 'win32') {
      process.kill(live.state.pid);
    } else {
      process.kill(live.state.pid, 'SIGTERM');
    }
  } catch {
    clearDaemonState();
    return { kind: 'stale' };
  }
  // Wait for the port to go quiet so `mdview stop && mdview .` can't race.
  await waitFor(async () => ((await probeHealth(live.state.port)) === null ? true : null), 3_000);
  clearDaemonState();
  return { kind: 'stopped', pid: live.state.pid };
}
