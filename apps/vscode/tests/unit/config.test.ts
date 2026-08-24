import { describe, it, expect, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { readConfig, buildCliArgs } from '../../src/config/loader';
import type { ResolvedConfig } from '../../src/config/loader';

// Cast to access test helpers defined in the mock
const wsMock = vscode.workspace as typeof vscode.workspace & {
  __setConfig: (key: string, value: unknown) => void;
  __resetConfig: () => void;
};

beforeEach(() => {
  wsMock.__resetConfig();
});

const folderUri = vscode.Uri.file('/workspace/project');

describe('readConfig — happy path defaults', () => {
  it('returns expected shape with all defaults', () => {
    const cfg = readConfig(folderUri);
    expect(cfg.port).toBe(0);
    expect(cfg.palette).toBe('auto');
    expect(cfg.preview.openIn).toBe('webview');
  });
});

describe('readConfig — port validation', () => {
  it('falls back to 0 for negative port', () => {
    wsMock.__setConfig('mdview.port', -1);
    expect(readConfig(folderUri).port).toBe(0);
  });

  it('falls back to 0 for port > 65535', () => {
    wsMock.__setConfig('mdview.port', 65536);
    expect(readConfig(folderUri).port).toBe(0);
  });

  it('falls back to 0 for NaN', () => {
    wsMock.__setConfig('mdview.port', NaN);
    expect(readConfig(folderUri).port).toBe(0);
  });

  it('falls back to 0 for non-integer (float)', () => {
    wsMock.__setConfig('mdview.port', 8080.5);
    expect(readConfig(folderUri).port).toBe(0);
  });

  it('accepts valid port 3000', () => {
    wsMock.__setConfig('mdview.port', 3000);
    expect(readConfig(folderUri).port).toBe(3000);
  });

  it('accepts 0 (ephemeral)', () => {
    wsMock.__setConfig('mdview.port', 0);
    expect(readConfig(folderUri).port).toBe(0);
  });

  it('accepts 65535 (max valid)', () => {
    wsMock.__setConfig('mdview.port', 65535);
    expect(readConfig(folderUri).port).toBe(65535);
  });
});

describe('readConfig — palette validation', () => {
  it('falls back to auto for unknown value "rainbow"', () => {
    wsMock.__setConfig('mdview.palette', 'rainbow');
    expect(readConfig(folderUri).palette).toBe('auto');
  });

  it('falls back to auto for empty string', () => {
    wsMock.__setConfig('mdview.palette', '');
    expect(readConfig(folderUri).palette).toBe('auto');
  });

  it('falls back to auto for non-string (number)', () => {
    wsMock.__setConfig('mdview.palette', 42);
    expect(readConfig(folderUri).palette).toBe('auto');
  });

  it('accepts all valid palettes', () => {
    for (const p of ['auto', 'classic', 'paper', 'nord', 'solarized', 'high-contrast'] as const) {
      wsMock.__resetConfig();
      wsMock.__setConfig('mdview.palette', p);
      expect(readConfig(folderUri).palette).toBe(p);
    }
  });
});

describe('readConfig — preview.openIn validation', () => {
  it('falls back to webview for unknown value', () => {
    wsMock.__setConfig('mdview.preview.openIn', 'tab');
    expect(readConfig(folderUri).preview.openIn).toBe('webview');
  });

  it('accepts "browser"', () => {
    wsMock.__setConfig('mdview.preview.openIn', 'browser');
    expect(readConfig(folderUri).preview.openIn).toBe('browser');
  });

  it('accepts "webview"', () => {
    wsMock.__setConfig('mdview.preview.openIn', 'webview');
    expect(readConfig(folderUri).preview.openIn).toBe('webview');
  });
});

describe('buildCliArgs', () => {
  it('includes --vscode, --port, --palette flags', () => {
    const cfg: ResolvedConfig = {
      port: 3000,
      palette: 'nord',
      preview: { openIn: 'webview' },
    };
    const args = buildCliArgs('/workspace/project', cfg, 'nord');
    expect(args).toContain('--vscode');
    expect(args).toContain('--port');
    expect(args).toContain('3000');
    expect(args).toContain('--palette');
    expect(args).toContain('nord');
    expect(args[0]).toBe('/workspace/project');
  });

  it('does NOT include an --ignore flag (CLI does not accept one)', () => {
    const cfg: ResolvedConfig = {
      port: 0,
      palette: 'auto',
      preview: { openIn: 'webview' },
    };
    const args = buildCliArgs('/workspace/project', cfg, 'paper');
    expect(args).not.toContain('--ignore');
  });

  it('uses resolvedPalette, not cfg.palette', () => {
    const cfg: ResolvedConfig = {
      port: 0,
      palette: 'auto',
      preview: { openIn: 'webview' },
    };
    const args = buildCliArgs('/workspace/project', cfg, 'paper');
    const paletteIdx = args.indexOf('--palette');
    expect(paletteIdx).toBeGreaterThan(-1);
    expect(args[paletteIdx + 1]).toBe('paper');
  });
});
