import { computed } from '@preact/signals';
import type { HeadingLevel } from '../../shared/types.js';
import { createPersistedNumber } from '../lib/persisted-signal.js';

export const OUTLINE_LEVEL_MIN: HeadingLevel = 1;
export const OUTLINE_LEVEL_MAX: HeadingLevel = 6;

const minPersisted = createPersistedNumber(
  'mdview-outline-min-level',
  OUTLINE_LEVEL_MIN,
  { min: OUTLINE_LEVEL_MIN, max: OUTLINE_LEVEL_MAX },
);
const maxPersisted = createPersistedNumber(
  'mdview-outline-max-level',
  OUTLINE_LEVEL_MAX,
  { min: OUTLINE_LEVEL_MIN, max: OUTLINE_LEVEL_MAX },
);

export const outlineMinLevelSignal = minPersisted.signal;
export const outlineMaxLevelSignal = maxPersisted.signal;

/**
 * Setters enforce `min ≤ max`. If the user drags one thumb past the other,
 * push the other one along so the range stays valid (don't silently clamp
 * to the previous bound — that traps the user when both thumbs are equal).
 */
export function setOutlineMinLevel(level: HeadingLevel): void {
  minPersisted.set(level);
  if (level > maxPersisted.signal.value) {
    maxPersisted.set(level);
  }
}

export function setOutlineMaxLevel(level: HeadingLevel): void {
  maxPersisted.set(level);
  if (level < minPersisted.signal.value) {
    minPersisted.set(level);
  }
}

/**
 * Visible levels derived from the range slider: `{min..max}` inclusive.
 * Kept as a computed signal so existing consumers (`filterOutline`) work
 * without changing shape.
 */
export const outlineLevelsSignal = computed<ReadonlySet<HeadingLevel>>(() => {
  const lo = outlineMinLevelSignal.value;
  const hi = outlineMaxLevelSignal.value;
  const out = new Set<HeadingLevel>();
  for (let i = lo; i <= hi; i++) out.add(i as HeadingLevel);
  return out;
});
