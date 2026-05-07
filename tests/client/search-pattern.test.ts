import { describe, it, expect } from 'vitest';
import { compilePattern, DEFAULT_OPTIONS } from '../../src/shared/search-pattern.js';

describe('compilePattern', () => {
  it('default mode is case-insensitive substring', () => {
    const p = compilePattern('foo', DEFAULT_OPTIONS);
    expect(p.matchAll('Food and FOOTPRINT and foo')).toHaveLength(3);
  });

  it('case-sensitive narrows matches', () => {
    const p = compilePattern('foo', { ...DEFAULT_OPTIONS, caseSensitive: true });
    expect(p.matchAll('Food and FOOTPRINT and foo')).toHaveLength(1);
  });

  it('whole-word excludes substrings', () => {
    const p = compilePattern('cat', { ...DEFAULT_OPTIONS, wholeWord: true });
    expect(p.matchAll('cat catalog category cats')).toHaveLength(1);
  });

  it('regex mode interprets pattern', () => {
    const p = compilePattern('\\d+', { ...DEFAULT_OPTIONS, regex: true });
    expect(p.matchAll('abc 123 def 456')).toHaveLength(2);
  });

  it('invalid regex returns valid: false', () => {
    const p = compilePattern('(', { ...DEFAULT_OPTIONS, regex: true });
    expect(p.valid).toBe(false);
    expect(p.matchAll('anything')).toEqual([]);
  });

  it('escapes regex chars in non-regex mode', () => {
    const p = compilePattern('a.b', DEFAULT_OPTIONS);
    expect(p.matchAll('aXb a.b axx.bb')).toEqual([{ index: 4, length: 3 }]);
  });

  it('avoids infinite loop on zero-width regex matches', () => {
    const p = compilePattern('a*', { ...DEFAULT_OPTIONS, regex: true });
    expect(p.matchAll('aaa')).toHaveLength(1);
  });
});
