import * as vscode from 'vscode';
import type { Palette, PaletteSetting } from '../config/loader';

/**
 * Maps a VS Code theme kind to an mdview palette.
 *
 * Only the high-contrast kinds pick a distinct palette. Light vs dark is a
 * separate axis in the renderer — every palette defines both — so answering
 * with different palettes for Light and Dark would be picking a colour scheme
 * on the user's behalf rather than following their theme.
 */
export function themeKindToPalette(kind: vscode.ColorThemeKind): Palette {
  switch (kind) {
    case vscode.ColorThemeKind.HighContrast:
    case vscode.ColorThemeKind.HighContrastLight:
      return 'high-contrast';
    default:
      return 'flexoki';
  }
}

export function resolvePalette(setting: PaletteSetting, kind: vscode.ColorThemeKind): Palette {
  return setting === 'auto' ? themeKindToPalette(kind) : setting;
}
