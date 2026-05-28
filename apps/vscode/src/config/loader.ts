import * as vscode from 'vscode';
import { log } from '../output';

export type Palette = 'classic' | 'paper' | 'nord' | 'solarized' | 'high-contrast';
export type PaletteSetting = Palette | 'auto';

const KNOWN_PALETTES: readonly PaletteSetting[] = ['auto', 'classic', 'paper', 'nord', 'solarized', 'high-contrast'] as const;
const IGNORE_PATTERN = /^[A-Za-z0-9_.\-+]{1,64}$/;

export interface ResolvedConfig {
  port: number;
  palette: PaletteSetting;
  ignore: string[];
  preview: { openIn: 'webview' | 'browser' };
}

export function readConfig(folderUri: vscode.Uri): ResolvedConfig {
  const cfg = vscode.workspace.getConfiguration('mdview', folderUri);

  // Port: finite integer in [0, 65535]; fall back to 0 (ephemeral) on invalid.
  const rawPort = cfg.get<number>('port', 0);
  const port =
    Number.isFinite(rawPort) && Number.isInteger(rawPort) && rawPort >= 0 && rawPort <= 65535
      ? rawPort
      : 0;
  if (port !== rawPort) log(`mdview.port "${rawPort}" is invalid; using 0 (ephemeral).`);

  // Palette: allow-list; fall back to 'auto' on invalid.
  const rawPalette = cfg.get<string>('palette', 'auto');
  const palette: PaletteSetting = (KNOWN_PALETTES as readonly string[]).includes(rawPalette)
    ? (rawPalette as PaletteSetting)
    : 'auto';
  if (palette !== rawPalette) log(`mdview.palette "${rawPalette}" is invalid; using 'auto'.`);

  const rawIgnore = cfg.get<string[]>('ignore', []) ?? [];
  const ignore = Array.isArray(rawIgnore)
    ? rawIgnore.filter(
        (s) => typeof s === 'string' && IGNORE_PATTERN.test(s) && s !== '.' && s !== '..',
      )
    : [];
  if (ignore.length !== rawIgnore.length)
    log(
      `mdview.ignore contained invalid entries; filtered to ${ignore.length} of ${rawIgnore.length}.`,
    );

  // preview.openIn: allow-list, default 'webview'.
  const rawOpenIn = cfg.get<string>('preview.openIn', 'webview');
  const openIn: 'webview' | 'browser' = rawOpenIn === 'browser' ? 'browser' : 'webview';

  return { port, palette, ignore, preview: { openIn } };
}

export function buildCliArgs(
  folderPath: string,
  cfg: ResolvedConfig,
  resolvedPalette: Palette,
): string[] {
  // port 0 is intentional when the user hasn't set mdview.port — the CLI binds an
  // ephemeral port and reports it back in the ready signal.
  const args: string[] = [folderPath, '--vscode', '--port', String(cfg.port)];
  args.push('--palette', resolvedPalette);
  // The CLI has no --ignore flag; ignores come from .mdview.json. cfg.ignore is
  // kept on ResolvedConfig so callers can surface validation results to the user.
  return args;
}
