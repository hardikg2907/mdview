import { describe, it, expect } from 'vitest';
import * as vscode from 'vscode';
import { themeKindToPalette, resolvePalette } from '../../src/theme/palette';

describe('themeKindToPalette', () => {
  // Light vs dark is a separate axis in the renderer, so only the
  // high-contrast kinds change the palette.
  it('maps Light → flexoki', () =>
    expect(themeKindToPalette(vscode.ColorThemeKind.Light)).toBe('flexoki'));
  it('maps Dark → flexoki', () =>
    expect(themeKindToPalette(vscode.ColorThemeKind.Dark)).toBe('flexoki'));
  it('maps HighContrast → high-contrast', () =>
    expect(themeKindToPalette(vscode.ColorThemeKind.HighContrast)).toBe('high-contrast'));
  it('maps HighContrastLight → high-contrast', () =>
    expect(themeKindToPalette(vscode.ColorThemeKind.HighContrastLight)).toBe('high-contrast'));
});

describe('resolvePalette', () => {
  it('honors explicit user palette over theme', () => {
    expect(resolvePalette('kanagawa', vscode.ColorThemeKind.Light)).toBe('kanagawa');
    expect(resolvePalette('paper', vscode.ColorThemeKind.Dark)).toBe('paper');
    expect(resolvePalette('solarized', vscode.ColorThemeKind.HighContrast)).toBe('solarized');
    // An explicit choice beats even the high-contrast kinds.
    expect(resolvePalette('rose-pine', vscode.ColorThemeKind.HighContrast)).toBe('rose-pine');
  });
  it('"auto" maps via theme kind', () => {
    expect(resolvePalette('auto', vscode.ColorThemeKind.Light)).toBe('flexoki');
    expect(resolvePalette('auto', vscode.ColorThemeKind.Dark)).toBe('flexoki');
    expect(resolvePalette('auto', vscode.ColorThemeKind.HighContrast)).toBe('high-contrast');
  });
});
