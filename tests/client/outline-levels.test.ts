import { beforeEach, describe, expect, it } from 'vitest';
import {
  OUTLINE_LEVEL_MAX,
  OUTLINE_LEVEL_MIN,
  outlineLevelsSignal,
  outlineMaxLevelSignal,
  outlineMinLevelSignal,
  setOutlineMaxLevel,
  setOutlineMinLevel,
} from '../../src/client/hooks/useOutlineLevels.js';
import type { HeadingLevel } from '../../src/shared/types.js';

function reset(): void {
  // Restore defaults between tests via the public setters so persistence
  // stays in lockstep with signal value.
  setOutlineMinLevel(OUTLINE_LEVEL_MIN);
  setOutlineMaxLevel(OUTLINE_LEVEL_MAX);
}

describe('useOutlineLevels — 2-way range slider model', () => {
  beforeEach(reset);

  it('defaults to the full range', () => {
    expect(outlineMinLevelSignal.value).toBe(1);
    expect(outlineMaxLevelSignal.value).toBe(6);
    expect([...outlineLevelsSignal.value].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('derives visible levels as {min..max} inclusive', () => {
    setOutlineMinLevel(2 as HeadingLevel);
    setOutlineMaxLevel(4 as HeadingLevel);
    expect([...outlineLevelsSignal.value].sort()).toEqual([2, 3, 4]);
  });

  it('shows a single level when min === max', () => {
    setOutlineMinLevel(3 as HeadingLevel);
    setOutlineMaxLevel(3 as HeadingLevel);
    expect([...outlineLevelsSignal.value]).toEqual([3]);
  });

  it('pushes max along when min is dragged past it', () => {
    // Start narrow.
    setOutlineMinLevel(2 as HeadingLevel);
    setOutlineMaxLevel(3 as HeadingLevel);
    // User drags min thumb to 5 — max should follow so range stays valid
    // (don't trap the user by silently clamping min to 3).
    setOutlineMinLevel(5 as HeadingLevel);
    expect(outlineMinLevelSignal.value).toBe(5);
    expect(outlineMaxLevelSignal.value).toBe(5);
  });

  it('pulls min along when max is dragged below it', () => {
    setOutlineMinLevel(4 as HeadingLevel);
    setOutlineMaxLevel(5 as HeadingLevel);
    setOutlineMaxLevel(2 as HeadingLevel);
    expect(outlineMinLevelSignal.value).toBe(2);
    expect(outlineMaxLevelSignal.value).toBe(2);
  });
});
