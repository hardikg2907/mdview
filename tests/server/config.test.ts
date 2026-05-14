import { describe, it, expect, vi } from 'vitest';
import { validateConfig, mergeConfigs } from '../../src/server/config.js';

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
    expect(validateConfig({ palette: 'nord' })).toEqual({ palette: 'nord' });
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
    expect(validateConfig({ palette: 'nord', undocumented: 123 })).toEqual({ palette: 'nord' });
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
    const merged = mergeConfigs({ palette: 'nord' }, { palette: 'solarized' });
    expect(merged?.palette).toBe('solarized');
  });

  it('falls back to global when project is missing a field', () => {
    const merged = mergeConfigs({ palette: 'nord', fontFamily: 'mono' }, { palette: 'classic' });
    expect(merged?.palette).toBe('classic');
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
