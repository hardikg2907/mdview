import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PALETTES, type ProjectConfig, type Palette, type FontFamily } from '../shared/types.js';

export const CONFIG_FILENAME = '.mdview.json';

const FONT_FAMILIES: readonly FontFamily[] = ['serif', 'sans', 'mono'];

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Validate a parsed JSON value against ProjectConfig. Unknown fields are
 * dropped silently; invalid types are dropped with a console warning.
 * Conservative: never throws — bad config falls back to "no config".
 */
export function validateConfig(raw: unknown): ProjectConfig | null {
  if (!isObject(raw)) return null;
  const out: ProjectConfig = {};

  if ('palette' in raw) {
    const p = raw.palette;
    if (typeof p === 'string' && PALETTES.includes(p as Palette)) {
      out.palette = p as Palette;
    } else {
      console.warn(`[mdview] ${CONFIG_FILENAME}: ignoring invalid palette: ${String(p)}`);
    }
  }

  if ('fontFamily' in raw) {
    const f = raw.fontFamily;
    if (typeof f === 'string' && FONT_FAMILIES.includes(f as FontFamily)) {
      out.fontFamily = f as FontFamily;
    } else {
      console.warn(`[mdview] ${CONFIG_FILENAME}: ignoring invalid fontFamily: ${String(f)}`);
    }
  }

  if ('lineWidth' in raw) {
    const w = raw.lineWidth;
    // Accept short strings only — passed straight to CSS, so reject anything
    // longer than 32 chars to limit the trust surface for inline style.
    if (typeof w === 'string' && w.length > 0 && w.length <= 32 && /^[\w%.\-]+$/.test(w)) {
      out.lineWidth = w;
    } else {
      console.warn(`[mdview] ${CONFIG_FILENAME}: ignoring invalid lineWidth: ${String(w)}`);
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

  return out;
}

export async function loadProjectConfig(rootAbsPath: string): Promise<ProjectConfig | null> {
  const filePath = path.join(rootAbsPath, CONFIG_FILENAME);
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    console.warn(`[mdview] failed to read ${CONFIG_FILENAME}: ${(err as Error).message}`);
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.warn(`[mdview] ${CONFIG_FILENAME} is not valid JSON: ${(err as Error).message}`);
    return null;
  }
  return validateConfig(parsed);
}
