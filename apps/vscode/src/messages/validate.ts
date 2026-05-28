import type { KnownIncomingMessage } from './types';

// ---------------------------------------------------------------------------
// Per-field validators
// ---------------------------------------------------------------------------

const MAX_REL_PATH = 512;
const MAX_LINE = 1_000_000;
const MAX_ERROR_MSG = 4096;

const CONTROL_CHAR_RE = /[\x00-\x1f\x7f]/;
const DOT_DOT_RE = /(?:^|[/\\])\.\.(?:[/\\]|$)/;

/**
 * Validates a relative path string from an untrusted source.
 * Returns the string if valid, or null if it should be rejected.
 */
export function validateRelPath(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  if (v.length === 0 || v.length > MAX_REL_PATH) return null;
  // Must not be absolute.
  if (v.startsWith('/') || v.startsWith('\\')) return null;
  // Must not contain '..' as a path segment.
  if (DOT_DOT_RE.test(v)) return null;
  // Also catch bare '..'
  if (v === '..') return null;
  // Must not contain NUL or other control characters.
  if (CONTROL_CHAR_RE.test(v)) return null;
  return v;
}

/**
 * Validates a line number from an untrusted source.
 * Returns the number if valid, or null if it should be rejected.
 */
export function validateLine(v: unknown): number | null {
  if (typeof v !== 'number') return null;
  if (!Number.isFinite(v)) return null;
  if (!Number.isInteger(v)) return null;
  if (v < 0 || v > MAX_LINE) return null;
  return v;
}

/**
 * Validates an error message string from an untrusted source.
 * Strips control characters and truncates to a safe length.
 * Returns a sanitised string, or null if the input is not a string.
 */
export function validateErrorMessage(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  // Preserve tab/LF/CR — they read sensibly in logs; strip everything else.
  const stripped = v.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
  // Cap at MAX_ERROR_MSG before further use; log callers should cap to 1 KiB.
  return stripped.slice(0, MAX_ERROR_MSG);
}

// ---------------------------------------------------------------------------
// Top-level validator
// ---------------------------------------------------------------------------

/**
 * Validates an unknown incoming message from the SPA.
 * Returns the typed message if valid, or null if the message should be
 * dropped silently.
 */
export function validateIncoming(msg: unknown): KnownIncomingMessage | null {
  if (!msg || typeof msg !== 'object') return null;
  const m = msg as Record<string, unknown>;
  const type = m['type'];
  if (typeof type !== 'string') return null;

  switch (type) {
    case 'mdview/ready': {
      return { type: 'mdview/ready' };
    }

    case 'mdview/internal-link-clicked': {
      const relPath = validateRelPath(m['relPath']);
      if (relPath === null) return null;
      const fromFile = validateRelPath(m['fromFile']);
      if (fromFile === null) return null;
      return { type: 'mdview/internal-link-clicked', relPath, fromFile };
    }

    case 'mdview/heading-clicked': {
      const line = validateLine(m['line']);
      if (line === null) return null;
      const file = validateRelPath(m['file']);
      if (file === null) return null;
      return { type: 'mdview/heading-clicked', line, file };
    }

    case 'mdview/error': {
      const message = validateErrorMessage(m['message']);
      if (message === null) return null;
      return { type: 'mdview/error', message };
    }

    default:
      // Unknown type — drop silently.
      return null;
  }
}
