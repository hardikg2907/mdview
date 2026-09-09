import * as vscode from 'vscode';
import { log } from '../output';

export type Palette =
  | 'flexoki'
  | 'paper'
  | 'solarized'
  | 'everforest'
  | 'rose-pine'
  | 'kanagawa'
  | 'catppuccin'
  | 'high-contrast';
export type PaletteSetting = Palette | 'auto';

/** Allow-list for `mdview.palette`. Must match the enum contributed in package.json. */
export const KNOWN_PALETTES: readonly PaletteSetting[] = [
  'auto',
  'flexoki',
  'paper',
  'solarized',
  'everforest',
  'rose-pine',
  'kanagawa',
  'catppuccin',
  'high-contrast',
] as const;

export interface ResolvedConfig {
  port: number;
  palette: PaletteSetting;
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

  // preview.openIn: allow-list, default 'webview'.
  const rawOpenIn = cfg.get<string>('preview.openIn', 'webview');
  const openIn: 'webview' | 'browser' = rawOpenIn === 'browser' ? 'browser' : 'webview';

  return { port, palette, preview: { openIn } };
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
  return args;
}
