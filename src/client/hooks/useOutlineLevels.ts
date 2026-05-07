import type { HeadingLevel } from '../../shared/types.js';
import { ALL_LEVELS } from '../lib/outline-filter.js';
import { createPersistedSignal } from '../lib/persisted-signal.js';

const persisted = createPersistedSignal<Set<HeadingLevel>>(
  'mdview-outline-levels',
  new Set(ALL_LEVELS),
  {
    parse(raw) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return null;
        const valid = parsed.filter(
          (n): n is HeadingLevel =>
            typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 6,
        );
        return valid.length === 0 ? null : new Set(valid);
      } catch {
        return null;
      }
    },
    serialize: (s) => JSON.stringify([...s].sort()),
  },
);

export const outlineLevelsSignal = persisted.signal;

export function toggleLevel(level: HeadingLevel): void {
  const next = new Set(persisted.signal.value);
  if (next.has(level)) next.delete(level);
  else next.add(level);
  persisted.set(next);
}
