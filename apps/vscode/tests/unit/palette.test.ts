import { describe, it, expect } from 'vitest';
import * as vscode from 'vscode';
import { themeKindToPalette, resolvePalette } from '../../src/theme/palette';

describe('themeKindToPalette', () => {
  it('maps Light → paper', () =>
    expect(themeKindToPalette(vscode.ColorThemeKind.Light)).toBe('paper'));
  it('maps Dark → nord', () =>
    expect(themeKindToPalette(vscode.ColorThemeKind.Dark)).toBe('nord'));
  it('maps HighContrast → high-contrast', () =>
    expect(themeKindToPalette(vscode.ColorThemeKind.HighContrast)).toBe('high-contrast'));
  it('maps HighContrastLight → high-contrast', () =>
    expect(themeKindToPalette(vscode.ColorThemeKind.HighContrastLight)).toBe('high-contrast'));
});

describe('resolvePalette', () => {
  it('honors explicit user palette over theme', () => {
    expect(resolvePalette('nord', vscode.ColorThemeKind.Light)).toBe('nord');
    expect(resolvePalette('paper', vscode.ColorThemeKind.Dark)).toBe('paper');
    expect(resolvePalette('solarized', vscode.ColorThemeKind.HighContrast)).toBe('solarized');
  });
  it('"auto" maps via theme kind', () => {
    expect(resolvePalette('auto', vscode.ColorThemeKind.Light)).toBe('paper');
    expect(resolvePalette('auto', vscode.ColorThemeKind.Dark)).toBe('nord');
  });
});
