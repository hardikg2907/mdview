import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PALETTES, type ProjectConfig, type Palette, type FontFamily } from '../shared/types.js';

export const CONFIG_FILENAME = '.mdview.json';
export const GLOBAL_CONFIG_FILENAME = 'config.json';

const FONT_FAMILIES: readonly FontFamily[] = ['serif', 'sans', 'mono'];

// Tight allow-list for ignore entries. Basenames only — no path separators,
// no globs, no whitespace, no traversal sequences. The downstream comparison
// is plain string equality on directory names, so wildcards would silently
// match nothing and confuse the user.
const IGNORE_ENTRY_PATTERN = /^[A-Za-z0-9_.\-+]{1,64}$/;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Build the path to the user-wide config (`$XDG_CONFIG_HOME/mdview/config.json`,
 * falling back to `~/.config/mdview/config.json` on every platform). Same
 * location is referenced in CLAUDE.md §8 as the only sanctioned writable spot
 * outside the watched root.
 */
export function globalConfigPath(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg && xdg.length > 0 ? xdg : path.join(os.homedir(), '.config');
  return path.join(base, 'mdview', GLOBAL_CONFIG_FILENAME);
}

/**
 * Validate a parsed JSON value against ProjectConfig. Unknown fields are
 * dropped silently; invalid types are dropped with a console warning.
 * Conservative: never throws — bad config falls back to "no config".
 */
export function validateConfig(raw: unknown, source = CONFIG_FILENAME): ProjectConfig | null {
  if (!isObject(raw)) return null;
  const out: ProjectConfig = {};

  if ('palette' in raw) {
    const p = raw.palette;
    if (typeof p === 'string' && PALETTES.includes(p as Palette)) {
      out.palette = p as Palette;
    } else {
      console.warn(`[mdview] ${source}: ignoring invalid palette: ${String(p)}`);
    }
  }

  if ('fontFamily' in raw) {
    const f = raw.fontFamily;
    if (typeof f === 'string' && FONT_FAMILIES.includes(f as FontFamily)) {
      out.fontFamily = f as FontFamily;
    } else {
      console.warn(`[mdview] ${source}: ignoring invalid fontFamily: ${String(f)}`);
    }
  }

  if ('lineWidth' in raw) {
    const w = raw.lineWidth;
    // Accept short strings only — passed straight to CSS, so reject anything
    // longer than 32 chars to limit the trust surface for inline style.
    if (typeof w === 'string' && w.length > 0 && w.length <= 32 && /^[\w%.\-]+$/.test(w)) {
      out.lineWidth = w;
    } else {
      console.warn(`[mdview] ${source}: ignoring invalid lineWidth: ${String(w)}`);
    }
  }

  if ('defaultCollapsed' in raw && isObject(raw.defaultCollapsed)) {
    const dc = raw.defaultCollapsed;
    const collapsed: ProjectConfig['defaultCollapsed'] = {};
    if (typeof dc.tree === 'boolean') collapsed.tree = dc.tree;
    if (typeof dc.outline === 'boolean') collapsed.outline = dc.outline;
    if (collapsed.tree !== undefined || collapsed.outline !== undefined) {
      out.defaultCollapsed = collapsed;
    }
  }

  if ('ignore' in raw) {
    const ig = raw.ignore;
    if (Array.isArray(ig)) {
      const cleaned: string[] = [];
      for (const entry of ig) {
        // Reject `.` / `..` explicitly even though they pass the char class —
        // they aren't real directory basenames and have a path-traversal smell.
        if (
          typeof entry === 'string' &&
          entry !== '.' &&
          entry !== '..' &&
          IGNORE_ENTRY_PATTERN.test(entry)
        ) {
          cleaned.push(entry);
        } else {
          console.warn(`[mdview] ${source}: ignoring invalid ignore entry: ${String(entry)}`);
        }
      }
      if (cleaned.length > 0) out.ignore = cleaned;
    } else {
      console.warn(`[mdview] ${source}: ignoring invalid ignore (expected array of strings)`);
    }
  }

  return out;
}

async function loadConfigFromPath(filePath: string, source: string): Promise<ProjectConfig | null> {
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    console.warn(`[mdview] failed to read ${source}: ${(err as Error).message}`);
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.warn(`[mdview] ${source} is not valid JSON: ${(err as Error).message}`);
    return null;
  }
  return validateConfig(parsed, source);
}

export async function loadProjectConfig(rootAbsPath: string): Promise<ProjectConfig | null> {
  return loadConfigFromPath(path.join(rootAbsPath, CONFIG_FILENAME), CONFIG_FILENAME);
}

export async function loadGlobalConfig(): Promise<ProjectConfig | null> {
  return loadConfigFromPath(globalConfigPath(), `~/.config/mdview/${GLOBAL_CONFIG_FILENAME}`);
}

/**
 * Merge global and project configs. Project values override global for all
 * scalar fields; `ignore` is unioned so a per-repo extra dir doesn't drop the
 * user's global build-dir list. Returns null if both inputs are null.
 */
export function mergeConfigs(
  global: ProjectConfig | null,
  project: ProjectConfig | null,
): ProjectConfig | null {
  if (!global && !project) return null;
  const out: ProjectConfig = {};
  if (global?.palette !== undefined) out.palette = global.palette;
  if (project?.palette !== undefined) out.palette = project.palette;
  if (global?.fontFamily !== undefined) out.fontFamily = global.fontFamily;
  if (project?.fontFamily !== undefined) out.fontFamily = project.fontFamily;
  if (global?.lineWidth !== undefined) out.lineWidth = global.lineWidth;
  if (project?.lineWidth !== undefined) out.lineWidth = project.lineWidth;
  if (global?.defaultCollapsed || project?.defaultCollapsed) {
    out.defaultCollapsed = { ...global?.defaultCollapsed, ...project?.defaultCollapsed };
  }
  const ig = [...(global?.ignore ?? []), ...(project?.ignore ?? [])];
  if (ig.length > 0) {
    out.ignore = Array.from(new Set(ig));
  }
  return out;
}

export async function loadEffectiveConfig(rootAbsPath: string): Promise<ProjectConfig | null> {
  const [global, project] = await Promise.all([
    loadGlobalConfig(),
    loadProjectConfig(rootAbsPath),
  ]);
  return mergeConfigs(global, project);
}
