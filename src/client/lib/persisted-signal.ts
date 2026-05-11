import { type Signal, signal } from '@preact/signals';

interface PersistOptions<T> {
  parse: (raw: string) => T | null;
  serialize: (v: T) => string;
}

// Whether we've already logged a localStorage access failure. Safari ITP and
// private modes can throw on every access; we only want to warn once per
// session so the console stays readable while still leaving a breadcrumb.
let loggedReadFailure = false;

/**
 * Reads a value from localStorage.
 *
 * Returns `null` for both "key not set" and "access denied" — callers can't
 * meaningfully recover from the latter, so collapsing them keeps the signal
 * API simple. The access-denied case is logged once per session via
 * `console.warn` so the situation is visible during debugging (e.g. Safari
 * private mode, ITP, blocked storage).
 */
function safeRead(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch (err) {
    if (!loggedReadFailure) {
      loggedReadFailure = true;
      // eslint-disable-next-line no-console
      console.warn(
        '[mdview] localStorage read blocked; falling back to defaults. ' +
          'Theme/UI prefs will not persist across reloads.',
        err,
      );
    }
    return null;
  }
}

function safeWrite(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // best-effort; quota exceeded, privacy mode, or storage disabled.
    // Read path already warned, so no extra logging here.
  }
}

export interface PersistedSignal<T> {
  signal: Signal<T>;
  set: (next: T) => void;
}

export function createPersistedSignal<T>(
  key: string,
  defaultValue: T,
  opts: PersistOptions<T>,
): PersistedSignal<T> {
  const raw = safeRead(key);
  const initial = raw !== null ? opts.parse(raw) : null;
  const sig = signal<T>(initial ?? defaultValue);
  return {
    signal: sig,
    set(next: T) {
      sig.value = next;
      safeWrite(key, opts.serialize(next));
    },
  };
}

export function createPersistedBool(key: string, defaultValue: boolean): PersistedSignal<boolean> {
  return createPersistedSignal<boolean>(key, defaultValue, {
    parse: (raw) => (raw === '1' ? true : raw === '0' ? false : null),
    serialize: (v) => (v ? '1' : '0'),
  });
}

export function createPersistedNumber(
  key: string,
  defaultValue: number,
  opts: { min: number; max: number },
): PersistedSignal<number> {
  const clamp = (n: number) => Math.min(opts.max, Math.max(opts.min, n));
  return createPersistedSignal<number>(key, defaultValue, {
    parse: (raw) => {
      const n = Number(raw);
      return Number.isFinite(n) ? clamp(n) : null;
    },
    serialize: (v) => String(clamp(v)),
  });
}

export function createPersistedString<T extends string>(
  key: string,
  defaultValue: T,
  allowed: readonly T[],
): PersistedSignal<T> {
  return createPersistedSignal<T>(key, defaultValue, {
    parse: (raw) => (allowed.includes(raw as T) ? (raw as T) : null),
    serialize: (v) => v,
  });
}
