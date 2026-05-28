import * as vscode from 'vscode';
import type { Palette, PaletteSetting } from '../config/loader';

export function themeKindToPalette(kind: vscode.ColorThemeKind): Palette {
  switch (kind) {
    case vscode.ColorThemeKind.Light:
      return 'paper';
    case vscode.ColorThemeKind.Dark:
      return 'nord';
    case vscode.ColorThemeKind.HighContrast:
      return 'high-contrast';
    case vscode.ColorThemeKind.HighContrastLight:
      // No dedicated light high-contrast palette exists in the renderer; reuse high-contrast.
      return 'high-contrast';
    default:
      return 'nord';
  }
}

export function resolvePalette(setting: PaletteSetting, kind: vscode.ColorThemeKind): Palette {
  return setting === 'auto' ? themeKindToPalette(kind) : setting;
}
