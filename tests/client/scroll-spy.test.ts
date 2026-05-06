import { describe, it, expect } from 'vitest';
import { pickActiveId } from '../../src/client/hooks/useScrollSpy.js';

describe('pickActiveId', () => {
  const positions = [
    { id: 'a', top: 0 },
    { id: 'b', top: 200 },
    { id: 'c', top: 500 },
  ];

  it('returns first heading when before all', () => {
    expect(pickActiveId(positions, -50)).toBe('a');
  });

  it('returns the most recently passed heading', () => {
    expect(pickActiveId(positions, 250)).toBe('b');
    expect(pickActiveId(positions, 600)).toBe('c');
  });

  it('returns null for empty list', () => {
    expect(pickActiveId([], 0)).toBeNull();
  });
});
