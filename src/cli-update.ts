import { statSync } from 'node:fs';
import path from 'node:path';
import { fetchLatestVersion, UpdateCheckError } from './update/latest.js';
import { compareVersions, parseVersion } from './update/semver.js';
import { readVersion } from './version.js';

const POSIX_SAFE = /^[A-Za-z0-9_@%+=:,./-]+$/;
const WINDOWS_UNSAFE = /["%^&|<>!]/;

function hasControlCharacter(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return true;
  }
  return false;
}

export interface InstallCommandEnv {
  execPath: string;
  platform: NodeJS.Platform;
  isFile: (file: string) => boolean;
}

function isFileOnDisk(file: string): boolean {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

/**
 * The npm that lives beside the Node running this CLI. With several Node
 * installs (nvm, Homebrew, a system one) a bare `npm` can belong to a different
 * one, and the upgrade would land where this mdview is not.
 *
 * Falls back to a bare `npm` when that file is missing or its path could not be
 * quoted safely for the shell. `version` has already passed the strict semver
 * check, so it needs no quoting.
 */
export function npmInstallCommand(version: string, env: InstallCommandEnv): string {
  const windows = env.platform === 'win32';
  const p = windows ? path.win32 : path.posix;
  const npm = p.join(p.dirname(env.execPath), windows ? 'npm.cmd' : 'npm');
  const args = `install -g @hardikg/mdview@${version}`;
  if (!env.isFile(npm) || hasControlCharacter(npm)) return `npm ${args}`;

  if (windows) {
    if (WINDOWS_UNSAFE.test(npm)) return `npm ${args}`;
    return /^[A-Za-z0-9_@+=:,.\\/-]+$/.test(npm) ? `${npm} ${args}` : `"${npm}" ${args}`;
  }
  const quoted = POSIX_SAFE.test(npm) ? npm : `'${npm.replace(/'/g, `'\\''`)}'`;
  return `${quoted} ${args}`;
}

export interface UpdateCommandDeps {
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  currentVersion?: string;
  install?: Partial<InstallCommandEnv>;
  log?: (line: string) => void;
  logError?: (line: string) => void;
}

/**
 * `mdview update`: look up the newest release and print the command that
 * installs it. mdview never runs that command itself, or any other process:
 * which npm, which prefix and whether to use sudo are the user's call.
 */
export async function runUpdateCommand(deps: UpdateCommandDeps = {}): Promise<number> {
  const log = deps.log ?? ((line: string) => console.log(line));
  const logError = deps.logError ?? ((line: string) => console.error(line));
  const current = deps.currentVersion ?? readVersion();
  const currentParsed = parseVersion(current);
  if (!currentParsed) {
    logError('mdview: could not read the version of this install, so it cannot compare.');
    return 1;
  }

  let latest: string;
  try {
    latest = await fetchLatestVersion({
      ...(deps.fetchFn ? { fetchFn: deps.fetchFn } : {}),
      ...(deps.timeoutMs === undefined ? {} : { timeoutMs: deps.timeoutMs }),
    });
  } catch (err) {
    if (err instanceof UpdateCheckError) {
      logError(`mdview: could not check for updates: ${err.message}.`);
      if (process.env.MDVIEW_DEBUG === '1' && err.cause instanceof Error && err.cause.stack) {
        logError(err.cause.stack);
      }
      return 1;
    }
    throw err;
  }

  // fetchLatestVersion only resolves with a string that parses.
  const order = compareVersions(parseVersion(latest)!, currentParsed);
  if (order > 0) {
    const command = npmInstallCommand(latest, {
      execPath: deps.install?.execPath ?? process.execPath,
      platform: deps.install?.platform ?? process.platform,
      isFile: deps.install?.isFile ?? isFileOnDisk,
    });
    log(`mdview ${current} → ${latest} is available.`);
    log('Install it with:');
    log('');
    log(`  ${command}`);
    log('');
    log('The background server restarts itself on the next `mdview` run.');
  } else if (order === 0) {
    log(`mdview ${current} is up to date.`);
  } else {
    log(`mdview ${current} is newer than the latest release (${latest}).`);
  }
  return 0;
}
