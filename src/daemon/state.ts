import { mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { globalConfigPath } from '../server/config.js';

/**
 * `~/.config/mdview/` (or `$XDG_CONFIG_HOME/mdview/`) — derived from the config
 * file's location so there is one answer to "where does mdview keep state",
 * and it is the only place outside the watched roots we ever write.
 */
export function stateDir(): string {
  return path.dirname(globalConfigPath());
}

export function daemonStatePath(): string {
  return path.join(stateDir(), 'daemon.json');
}

export function workspaceFilePath(): string {
  return path.join(stateDir(), 'workspace.json');
}

export function daemonLogPath(): string {
  return path.join(stateDir(), 'daemon.log');
}

export function daemonLockPath(): string {
  return path.join(stateDir(), 'daemon.lock');
}

/** Identity of the running background server. Nothing here is a secret. */
export interface DaemonState {
  pid: number;
  port: number;
  /**
   * Process start time. Paired with the pid to survive pid reuse: the OS will
   * eventually hand our recorded pid to an unrelated process, and we must never
   * signal that one.
   */
  startedAt: number;
}

/**
 * Write JSON so a reader never sees a half-written file: a fresh temp file gets
 * the content and the mode, then one rename swaps it in.
 */
export function writeJsonAtomic(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, file);
}

/** Parse JSON from disk, treating anything unreadable or malformed as absent. */
export function readJsonSafe(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    // Missing, unreadable, or truncated mid-write. A corrupt state file must
    // never be an error the user has to clean up by hand.
    return null;
  }
}

function isPositiveInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

export function readDaemonState(): DaemonState | null {
  const raw = readJsonSafe(daemonStatePath());
  if (!raw || typeof raw !== 'object') return null;
  const { pid, port, startedAt } = raw as Record<string, unknown>;
  if (!isPositiveInt(pid) || !isPositiveInt(port) || !isPositiveInt(startedAt)) return null;
  if (port > 65535) return null;
  return { pid, port, startedAt };
}

export function writeDaemonState(state: DaemonState): void {
  writeJsonAtomic(daemonStatePath(), state);
}

export function clearDaemonState(): void {
  rmSync(daemonStatePath(), { force: true });
}

/**
 * Take the spawn lock, so two `mdview` invocations racing from two terminals
 * produce one daemon rather than two fighting over the port. Returns false when
 * someone else holds it — the caller should wait for their daemon instead.
 */
export function tryTakeSpawnLock(staleAfterMs = 10_000): boolean {
  mkdirSync(stateDir(), { recursive: true, mode: 0o700 });
  const file = daemonLockPath();
  try {
    // 'wx' fails if the file exists, which is what makes this a lock.
    openSync(file, 'wx');
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
  }
  // A lock left behind by a process that died mid-spawn would otherwise wedge
  // every future run, so age it out and take it.
  try {
    if (Date.now() - statSync(file).mtimeMs < staleAfterMs) return false;
    rmSync(file, { force: true });
    openSync(file, 'wx');
    return true;
  } catch {
    return false;
  }
}

export function releaseSpawnLock(): void {
  rmSync(daemonLockPath(), { force: true });
}
