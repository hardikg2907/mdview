import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadEffectiveConfig,
  loadGlobalConfig,
  mergeConfigs,
  validateConfig,
} from '../../src/server/config.js';

describe('validateConfig', () => {
  it('returns null for non-object input', () => {
    expect(validateConfig(null)).toBeNull();
    expect(validateConfig(42)).toBeNull();
    expect(validateConfig('hi')).toBeNull();
    expect(validateConfig([])).toBeNull();
  });

  it('returns empty object for empty input', () => {
    expect(validateConfig({})).toEqual({});
  });

  it('accepts valid palettes', () => {
    expect(validateConfig({ palette: 'kanagawa' })).toEqual({ palette: 'kanagawa' });
    expect(validateConfig({ palette: 'solarized' })).toEqual({ palette: 'solarized' });
  });

  it('drops invalid palette with a warning', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(validateConfig({ palette: 'monokai' })).toEqual({});
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('accepts valid font families', () => {
    expect(validateConfig({ fontFamily: 'serif' })).toEqual({ fontFamily: 'serif' });
    expect(validateConfig({ fontFamily: 'sans' })).toEqual({ fontFamily: 'sans' });
  });

  it('accepts safe lineWidth strings', () => {
    expect(validateConfig({ lineWidth: '70ch' })).toEqual({ lineWidth: '70ch' });
    expect(validateConfig({ lineWidth: '720px' })).toEqual({ lineWidth: '720px' });
  });

  it('rejects lineWidth with disallowed characters', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(validateConfig({ lineWidth: 'calc(100vw - 200px)' })).toEqual({});
    expect(validateConfig({ lineWidth: '"; color:red' })).toEqual({});
    spy.mockRestore();
  });

  it('rejects lineWidth that is too long', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(validateConfig({ lineWidth: 'a'.repeat(33) })).toEqual({});
    spy.mockRestore();
  });

  it('extracts defaultCollapsed booleans', () => {
    expect(validateConfig({ defaultCollapsed: { tree: true } })).toEqual({
      defaultCollapsed: { tree: true },
    });
    expect(validateConfig({ defaultCollapsed: { tree: false, outline: true } })).toEqual({
      defaultCollapsed: { tree: false, outline: true },
    });
  });

  it('drops non-boolean defaultCollapsed fields', () => {
    expect(validateConfig({ defaultCollapsed: { tree: 'yes' } })).toEqual({});
  });

  it('drops unknown top-level fields silently', () => {
    expect(validateConfig({ palette: 'kanagawa', undocumented: 123 })).toEqual({ palette: 'kanagawa' });
  });

  describe('ignore field', () => {
    it('accepts an array of basename-safe strings', () => {
      expect(validateConfig({ ignore: ['deps', 'my-build', '_site'] })).toEqual({
        ignore: ['deps', 'my-build', '_site'],
      });
    });

    it('drops entries containing path separators or globs', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(validateConfig({ ignore: ['ok', 'foo/bar', '*.tmp', '..', 'has space'] })).toEqual({
        ignore: ['ok'],
      });
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('drops non-string entries', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(validateConfig({ ignore: ['ok', 42, null, true] })).toEqual({ ignore: ['ok'] });
      spy.mockRestore();
    });

    it('warns and drops a non-array ignore value', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(validateConfig({ ignore: 'just-one' })).toEqual({});
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});

describe('mergeConfigs', () => {
  it('returns null when both inputs are null', () => {
    expect(mergeConfigs(null, null)).toBeNull();
  });

  it('lets project override global for scalar fields', () => {
    const merged = mergeConfigs({ palette: 'kanagawa' }, { palette: 'solarized' });
    expect(merged?.palette).toBe('solarized');
  });

  it('falls back to global when project is missing a field', () => {
    const merged = mergeConfigs({ palette: 'kanagawa', fontFamily: 'mono' }, { palette: 'flexoki' });
    expect(merged?.palette).toBe('flexoki');
    expect(merged?.fontFamily).toBe('mono');
  });

  it('unions ignore lists and deduplicates', () => {
    const merged = mergeConfigs(
      { ignore: ['deps', 'shared'] },
      { ignore: ['shared', 'project-only'] },
    );
    expect(merged?.ignore?.sort()).toEqual(['deps', 'project-only', 'shared']);
  });
});

describe('updateCheck', () => {
  let tmp: string;
  let previousXdg: string | undefined;

  beforeEach(() => {
    tmp = mkdtempSync(path.join(tmpdir(), 'mdview-uc-'));
    previousXdg = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = path.join(tmp, 'xdg');
    mkdirSync(path.join(tmp, 'xdg', 'mdview'), { recursive: true });
    mkdirSync(path.join(tmp, 'repo'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (previousXdg === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = previousXdg;
    rmSync(tmp, { recursive: true, force: true });
  });

  it('is read from the global config', () => {
    expect(validateConfig({ updateCheck: true }, 'global', 'global')).toEqual({ updateCheck: true });
    expect(validateConfig({ updateCheck: false }, 'global', 'global')).toEqual({ updateCheck: false });
  });

  it('drops a non-boolean value from the global config', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(validateConfig({ updateCheck: 'yes' }, 'global', 'global')).toEqual({});
    expect(spy).toHaveBeenCalled();
  });

  it('is ignored with a warning in a project config, which is the default scope', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(validateConfig({ updateCheck: true })).toEqual({});
    expect(validateConfig({ updateCheck: true }, '.mdview.json', 'project')).toEqual({});
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('cannot be switched on by a .mdview.json in a folder the user opens', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    writeFileSync(
      path.join(tmp, 'repo', '.mdview.json'),
      JSON.stringify({ updateCheck: true, palette: 'kanagawa' }),
    );
    const effective = await loadEffectiveConfig(path.join(tmp, 'repo'));
    expect(effective).toEqual({ palette: 'kanagawa' });
    expect((await loadGlobalConfig())?.updateCheck).toBeUndefined();
  });

  it('does not let a project override a global opt-in, and never reaches the merged config', async () => {
    writeFileSync(path.join(tmp, 'xdg', 'mdview', 'config.json'), JSON.stringify({ updateCheck: true }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    writeFileSync(path.join(tmp, 'repo', '.mdview.json'), JSON.stringify({ updateCheck: false }));
    expect((await loadGlobalConfig())?.updateCheck).toBe(true);
    expect(await loadEffectiveConfig(path.join(tmp, 'repo'))).toEqual({});
  });

  it('is not carried by mergeConfigs, which feeds the browser', () => {
    expect(mergeConfigs({ updateCheck: true, palette: 'kanagawa' }, null)).toEqual({
      palette: 'kanagawa',
    });
  });
});
