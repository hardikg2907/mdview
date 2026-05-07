import { type Signal, signal } from '@preact/signals';

interface PersistOptions<T> {
  parse: (raw: string) => T | null;
  serialize: (v: T) => string;
}

function safeRead(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWrite(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // best-effort; quota or privacy mode
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
