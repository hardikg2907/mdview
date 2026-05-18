import { beforeEach, describe, expect, it } from 'vitest';
import {
  createPersistedBool,
  createPersistedNumber,
  createPersistedSignal,
  createPersistedString,
} from '../../src/client/lib/persisted-signal.js';

describe('createPersistedSignal', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('uses default when no stored value', () => {
    const { signal } = createPersistedSignal('k', 'def', {
      parse: (raw) => raw,
      serialize: (v) => v,
    });
    expect(signal.value).toBe('def');
  });

  it('reads stored value at construction', () => {
    localStorage.setItem('k', 'stored');
    const { signal } = createPersistedSignal('k', 'def', {
      parse: (raw) => raw,
      serialize: (v) => v,
    });
    expect(signal.value).toBe('stored');
  });

  it('writes through set()', () => {
    const { signal, set } = createPersistedSignal('k', 'def', {
      parse: (raw) => raw,
      serialize: (v) => v,
    });
    set('next');
    expect(signal.value).toBe('next');
    expect(localStorage.getItem('k')).toBe('next');
  });

  it('falls back to default when parse returns null', () => {
    localStorage.setItem('k', 'garbage');
    const { signal } = createPersistedSignal<number>('k', 5, {
      parse: (raw) => {
        const n = Number(raw);
        return Number.isFinite(n) ? n : null;
      },
      serialize: String,
    });
    expect(signal.value).toBe(5);
  });
});

describe('createPersistedBool', () => {
  beforeEach(() => localStorage.clear());

  it('persists true as "1" and false as "0"', () => {
    const b = createPersistedBool('flag', false);
    b.set(true);
    expect(localStorage.getItem('flag')).toBe('1');
    b.set(false);
    expect(localStorage.getItem('flag')).toBe('0');
  });

  it('reads "1" as true, "0" as false', () => {
    localStorage.setItem('a', '1');
    localStorage.setItem('b', '0');
    expect(createPersistedBool('a', false).signal.value).toBe(true);
    expect(createPersistedBool('b', true).signal.value).toBe(false);
  });

  it('uses default for unrecognized values', () => {
    localStorage.setItem('flag', 'true');
    expect(createPersistedBool('flag', false).signal.value).toBe(false);
  });
});

describe('createPersistedNumber', () => {
  beforeEach(() => localStorage.clear());

  it('clamps to min/max on read', () => {
    localStorage.setItem('n', '999');
    const n = createPersistedNumber('n', 100, { min: 50, max: 200 });
    expect(n.signal.value).toBe(200);
  });

  it('clamps on write', () => {
    const n = createPersistedNumber('n', 100, { min: 50, max: 200 });
    n.set(10);
    expect(localStorage.getItem('n')).toBe('50');
  });

  it('uses default for non-numeric stored value', () => {
    localStorage.setItem('n', 'abc');
    expect(createPersistedNumber('n', 75, { min: 0, max: 100 }).signal.value).toBe(75);
  });
});

describe('createPersistedString', () => {
  beforeEach(() => localStorage.clear());

  it('rejects values not in the allowed list', () => {
    localStorage.setItem('s', 'green');
    const s = createPersistedString('s', 'red' as const, ['red', 'blue'] as const);
    expect(s.signal.value).toBe('red');
  });

  it('accepts values in the allowed list', () => {
    localStorage.setItem('s', 'blue');
    const s = createPersistedString('s', 'red' as const, ['red', 'blue'] as const);
    expect(s.signal.value).toBe('blue');
  });
});
