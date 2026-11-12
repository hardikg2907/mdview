import { readFile, stat } from 'node:fs/promises';
import { writeJsonAtomic } from '../daemon/state.js';
import { globalConfigPath, MAX_CONFIG_BYTES } from './config.js';

// Same allow-list as validateConfig — keep them in sync. CLI args are also
// untrusted input, so applying the schema at the write boundary is required by
// the secure-coding rules even though `validateConfig` would catch them at
// read time.
const IGNORE_ENTRY_PATTERN = /^[A-Za-z0-9_.\-+]{1,64}$/;

export function isValidIgnoreEntry(s: string): boolean {
  return s !== '.' && s !== '..' && IGNORE_ENTRY_PATTERN.test(s);
}

/**
 * Read the raw JSON object at the global config path. Unknown top-level keys
 * are preserved on round-trip so the user can store forward-compat fields
 * without us silently dropping them. Throws if the file exists but isn't a
 * JSON object, to avoid clobbering whatever it actually is.
 */
async function readGlobalRaw(filePath: string): Promise<Record<string, unknown>> {
  let raw: string;
  try {
    const st = await stat(filePath);
    if (!st.isFile()) {
      throw new Error(`Existing config at ${filePath} is not a regular file.`);
    }
    if (st.size > MAX_CONFIG_BYTES) {
      throw new Error(`Existing config at ${filePath} exceeds ${MAX_CONFIG_BYTES} bytes.`);
    }
    raw = await readFile(filePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw err;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Existing config at ${filePath} is not valid JSON — fix or remove it before editing via CLI.`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Existing config at ${filePath} is not a JSON object — fix or remove it before editing via CLI.`);
  }
  return parsed as Record<string, unknown>;
}

async function writeGlobalRaw(filePath: string, data: Record<string, unknown>): Promise<void> {
  writeJsonAtomic(filePath, data);
}

function readIgnoreArray(cfg: Record<string, unknown>): string[] {
  const v = cfg.ignore;
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}

export interface IgnoreChangeResult {
  before: string[];
  after: string[];
  path: string;
}

export async function addIgnoreEntries(
  names: readonly string[],
  filePath: string = globalConfigPath(),
): Promise<IgnoreChangeResult> {
  for (const n of names) {
    if (!isValidIgnoreEntry(n)) {
      throw new Error(
        `Invalid ignore entry: ${JSON.stringify(n)}\n` +
          `  Must match /^[A-Za-z0-9_.\\-+]{1,64}$/ and not be '.' or '..'.`,
      );
    }
  }
  const cfg = await readGlobalRaw(filePath);
  const before = readIgnoreArray(cfg);
  const merged = Array.from(new Set([...before, ...names])).sort();
  cfg.ignore = merged;
  await writeGlobalRaw(filePath, cfg);
  return { before, after: merged, path: filePath };
}

export async function removeIgnoreEntries(
  names: readonly string[],
  filePath: string = globalConfigPath(),
): Promise<IgnoreChangeResult> {
  const cfg = await readGlobalRaw(filePath);
  const before = readIgnoreArray(cfg);
  const set = new Set(before);
  for (const n of names) set.delete(n);
  const after = Array.from(set).sort();
  if (after.length === 0) {
    delete cfg.ignore;
  } else {
    cfg.ignore = after;
  }
  await writeGlobalRaw(filePath, cfg);
  return { before, after, path: filePath };
}

export async function listUserIgnoreEntries(
  filePath: string = globalConfigPath(),
): Promise<string[]> {
  const cfg = await readGlobalRaw(filePath);
  return readIgnoreArray(cfg);
}

export interface UpdateCheckChangeResult {
  before: boolean;
  after: boolean;
  path: string;
}

/** Only an explicit `true` counts: anything else in the file means off. */
export async function readUpdateCheck(filePath: string = globalConfigPath()): Promise<boolean> {
  const cfg = await readGlobalRaw(filePath);
  return cfg.updateCheck === true;
}

export async function setUpdateCheck(
  enabled: boolean,
  filePath: string = globalConfigPath(),
): Promise<UpdateCheckChangeResult> {
  const cfg = await readGlobalRaw(filePath);
  const before = cfg.updateCheck === true;
  if (enabled) cfg.updateCheck = true;
  else delete cfg.updateCheck;
  await writeGlobalRaw(filePath, cfg);
  return { before, after: enabled, path: filePath };
}
