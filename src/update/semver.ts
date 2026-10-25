/**
 * A version string that came from outside this process (the registry, a running
 * daemon, a file on disk) ends up in the user's terminal. Matching this strict
 * shape before it is compared or printed is what keeps control characters and
 * escape sequences out of it.
 */
const PRERELEASE_ID = '(?:0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*)';
const SEMVER_PATTERN = new RegExp(
  `^(0|[1-9]\\d{0,8})\\.(0|[1-9]\\d{0,8})\\.(0|[1-9]\\d{0,8})(?:-(${PRERELEASE_ID}(?:\\.${PRERELEASE_ID})*))?$`,
);
const MAX_VERSION_LENGTH = 48;

export interface ParsedVersion {
  core: [number, number, number];
  pre: string[];
}

export function parseVersion(v: unknown): ParsedVersion | null {
  if (typeof v !== 'string' || v.length > MAX_VERSION_LENGTH) return null;
  const m = SEMVER_PATTERN.exec(v);
  if (!m) return null;
  return {
    core: [Number(m[1]), Number(m[2]), Number(m[3])],
    pre: m[4] === undefined ? [] : m[4].split('.'),
  };
}

export function isValidVersion(v: unknown): v is string {
  return parseVersion(v) !== null;
}

const NUMERIC = /^\d+$/;

function comparePreId(a: string, b: string): number {
  const an = NUMERIC.test(a);
  const bn = NUMERIC.test(b);
  // Numeric identifiers carry no leading zeros, so length orders them
  // correctly without converting to numbers that could lose precision.
  if (an && bn) return a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);
  if (an) return -1;
  if (bn) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Negative when `a` is older than `b`; a prerelease sorts before its release. */
export function compareVersions(a: ParsedVersion, b: ParsedVersion): number {
  for (let i = 0; i < 3; i++) {
    const d = a.core[i]! - b.core[i]!;
    if (d !== 0) return d;
  }
  if (a.pre.length === 0 && b.pre.length === 0) return 0;
  if (a.pre.length === 0) return 1;
  if (b.pre.length === 0) return -1;
  const n = Math.min(a.pre.length, b.pre.length);
  for (let i = 0; i < n; i++) {
    const d = comparePreId(a.pre[i]!, b.pre[i]!);
    if (d !== 0) return d;
  }
  return a.pre.length - b.pre.length;
}

/** True only when both parse and `candidate` is strictly newer than `current`. */
export function isNewerVersion(candidate: unknown, current: unknown): boolean {
  const c = parseVersion(candidate);
  const k = parseVersion(current);
  return c !== null && k !== null && compareVersions(c, k) > 0;
}
