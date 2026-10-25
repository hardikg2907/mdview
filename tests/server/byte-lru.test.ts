import { describe, expect, it } from 'vitest';
import { ByteLru } from '../../src/render/byte-lru.js';

describe('ByteLru', () => {
  it('returns a stored value and counts it as a hit', () => {
    const lru = new ByteLru(100);
    lru.set('a', 'hello');
    expect(lru.get('a')).toBe('hello');
    expect(lru.stats()).toMatchObject({ entries: 1, bytes: 6, hits: 1, misses: 0 });
  });

  it('returns undefined for an unknown key and counts a miss', () => {
    const lru = new ByteLru(100);
    expect(lru.get('nope')).toBeUndefined();
    expect(lru.stats()).toMatchObject({ entries: 0, hits: 0, misses: 1 });
  });

  it('evicts the least recently used entries once the byte cap is passed', () => {
    const lru = new ByteLru(10);
    lru.set('a', '1234');
    lru.set('b', '1234');
    lru.set('c', '1234');
    expect(lru.get('a')).toBeUndefined();
    expect(lru.get('b')).toBe('1234');
    expect(lru.get('c')).toBe('1234');
    expect(lru.stats().bytes).toBe(10);
  });

  it('keeps an entry that was read recently and evicts the older one', () => {
    const lru = new ByteLru(10);
    lru.set('a', '1234');
    lru.set('b', '1234');
    lru.get('a');
    lru.set('c', '1234');
    expect(lru.get('b')).toBeUndefined();
    expect(lru.get('a')).toBe('1234');
    expect(lru.get('c')).toBe('1234');
  });

  it('measures bytes, not characters', () => {
    const lru = new ByteLru(10);
    // Four characters, twelve bytes: over budget on its own.
    lru.set('wide', '€€€€');
    expect(lru.get('wide')).toBeUndefined();
    expect(lru.stats().bytes).toBe(0);
  });

  it('does not store a value larger than the whole cap, nor evict for it', () => {
    const lru = new ByteLru(10);
    lru.set('small', '1234');
    lru.set('huge', '12345678901');
    expect(lru.get('huge')).toBeUndefined();
    expect(lru.get('small')).toBe('1234');
  });

  it('replaces a value under the same key without double counting its bytes', () => {
    const lru = new ByteLru(100);
    lru.set('a', '12345');
    lru.set('a', '123');
    expect(lru.get('a')).toBe('123');
    expect(lru.stats()).toMatchObject({ entries: 1, bytes: 4 });
  });

  it('counts key bytes against the cap', () => {
    const lru = new ByteLru(10);
    lru.set('k'.repeat(8), '12345');
    expect(lru.stats()).toMatchObject({ entries: 0, bytes: 0 });
    lru.set('k', '12345');
    expect(lru.stats()).toMatchObject({ entries: 1, bytes: 6 });
  });
});
