import { describe, it, expect } from 'vitest';
import {
  validateIncoming,
  validateRelPath,
  validateLine,
  validateErrorMessage,
} from '../../src/messages/validate';
import { Dispatcher } from '../../src/messages/dispatcher';
import type { KnownIncomingMessage } from '../../src/messages/types';

// ---------------------------------------------------------------------------
// validateRelPath
// ---------------------------------------------------------------------------

describe('validateRelPath', () => {
  it('accepts a normal relative path', () => {
    expect(validateRelPath('docs/README.md')).toBe('docs/README.md');
  });

  it('accepts a simple filename', () => {
    expect(validateRelPath('README.md')).toBe('README.md');
  });

  it('accepts nested path with backslash separator', () => {
    expect(validateRelPath('src\\server\\index.ts')).toBe('src\\server\\index.ts');
  });

  it('rejects a non-string', () => {
    expect(validateRelPath(42)).toBeNull();
    expect(validateRelPath(null)).toBeNull();
    expect(validateRelPath(undefined)).toBeNull();
    expect(validateRelPath({})).toBeNull();
  });

  it('rejects empty string', () => {
    expect(validateRelPath('')).toBeNull();
  });

  it('rejects paths starting with /', () => {
    expect(validateRelPath('/etc/passwd')).toBeNull();
  });

  it('rejects paths starting with \\', () => {
    expect(validateRelPath('\\windows\\system32')).toBeNull();
  });

  it('rejects ".." as bare segment', () => {
    expect(validateRelPath('..')).toBeNull();
  });

  it('rejects paths containing ".." segment (Unix)', () => {
    expect(validateRelPath('docs/../etc/passwd')).toBeNull();
  });

  it('rejects paths containing ".." segment (Windows)', () => {
    expect(validateRelPath('docs\\..\\etc\\passwd')).toBeNull();
  });

  it('rejects ".." at start of path', () => {
    expect(validateRelPath('../sibling')).toBeNull();
  });

  it('rejects paths with NUL character', () => {
    expect(validateRelPath('docs/\x00evil')).toBeNull();
  });

  it('rejects paths with other control characters', () => {
    expect(validateRelPath('docs/\x01evil')).toBeNull();
    expect(validateRelPath('docs/\x1f')).toBeNull();
  });

  it('rejects paths exceeding 512 chars', () => {
    expect(validateRelPath('a'.repeat(513))).toBeNull();
  });

  it('accepts paths of exactly 512 chars', () => {
    const p = 'a'.repeat(512);
    expect(validateRelPath(p)).toBe(p);
  });
});

// ---------------------------------------------------------------------------
// validateLine
// ---------------------------------------------------------------------------

describe('validateLine', () => {
  it('accepts 0', () => {
    expect(validateLine(0)).toBe(0);
  });

  it('accepts a normal line number', () => {
    expect(validateLine(42)).toBe(42);
  });

  it('accepts the maximum (1_000_000)', () => {
    expect(validateLine(1_000_000)).toBe(1_000_000);
  });

  it('rejects negative numbers', () => {
    expect(validateLine(-1)).toBeNull();
  });

  it('rejects numbers above the cap', () => {
    expect(validateLine(1_000_001)).toBeNull();
  });

  it('rejects floats', () => {
    expect(validateLine(1.5)).toBeNull();
  });

  it('rejects NaN', () => {
    expect(validateLine(NaN)).toBeNull();
  });

  it('rejects Infinity', () => {
    expect(validateLine(Infinity)).toBeNull();
  });

  it('rejects a string', () => {
    expect(validateLine('42')).toBeNull();
  });

  it('rejects null', () => {
    expect(validateLine(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// validateErrorMessage
// ---------------------------------------------------------------------------

describe('validateErrorMessage', () => {
  it('accepts a normal string', () => {
    expect(validateErrorMessage('something broke')).toBe('something broke');
  });

  it('strips control characters (except LF/CR/tab)', () => {
    expect(validateErrorMessage('bad\x00char')).toBe('badchar');
    expect(validateErrorMessage('bad\x07bell')).toBe('badbell');
  });

  it('preserves newlines and tabs', () => {
    expect(validateErrorMessage('line1\nline2\ttab')).toBe('line1\nline2\ttab');
  });

  it('truncates to 4096 chars', () => {
    const long = 'x'.repeat(5000);
    expect(validateErrorMessage(long)).toHaveLength(4096);
  });

  it('rejects non-string', () => {
    expect(validateErrorMessage(42)).toBeNull();
    expect(validateErrorMessage(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// validateIncoming — accept cases
// ---------------------------------------------------------------------------

describe('validateIncoming — valid messages', () => {
  it('accepts mdview/ready with no extra fields', () => {
    const result = validateIncoming({ type: 'mdview/ready' });
    expect(result).toEqual({ type: 'mdview/ready' });
  });

  it('accepts mdview/ready and ignores extra fields', () => {
    const result = validateIncoming({ type: 'mdview/ready', extra: 'ignored' });
    expect(result).toEqual({ type: 'mdview/ready' });
  });

  it('accepts mdview/internal-link-clicked with valid paths', () => {
    const result = validateIncoming({
      type: 'mdview/internal-link-clicked',
      relPath: 'docs/guide.md',
      fromFile: 'README.md',
    });
    expect(result).toEqual({
      type: 'mdview/internal-link-clicked',
      relPath: 'docs/guide.md',
      fromFile: 'README.md',
    });
  });

  it('accepts mdview/heading-clicked with valid line and file', () => {
    const result = validateIncoming({
      type: 'mdview/heading-clicked',
      line: 10,
      file: 'README.md',
    });
    expect(result).toEqual({ type: 'mdview/heading-clicked', line: 10, file: 'README.md' });
  });

  it('accepts mdview/error with a valid message', () => {
    const result = validateIncoming({ type: 'mdview/error', message: 'oops' });
    expect(result).toEqual({ type: 'mdview/error', message: 'oops' });
  });
});

// ---------------------------------------------------------------------------
// validateIncoming — reject cases
// ---------------------------------------------------------------------------

describe('validateIncoming — rejected messages', () => {
  it('rejects null', () => {
    expect(validateIncoming(null)).toBeNull();
  });

  it('rejects a string', () => {
    expect(validateIncoming('mdview/ready')).toBeNull();
  });

  it('rejects a number', () => {
    expect(validateIncoming(42)).toBeNull();
  });

  it('rejects an unknown type', () => {
    expect(validateIncoming({ type: 'mdview/unknown' })).toBeNull();
  });

  it('rejects a message with no type field', () => {
    expect(validateIncoming({ relPath: 'README.md' })).toBeNull();
  });

  it('rejects mdview/internal-link-clicked with absolute relPath', () => {
    expect(
      validateIncoming({
        type: 'mdview/internal-link-clicked',
        relPath: '/etc/passwd',
        fromFile: 'README.md',
      }),
    ).toBeNull();
  });

  it('rejects mdview/internal-link-clicked with path traversal in relPath', () => {
    expect(
      validateIncoming({
        type: 'mdview/internal-link-clicked',
        relPath: '../secret.md',
        fromFile: 'README.md',
      }),
    ).toBeNull();
  });

  it('rejects mdview/internal-link-clicked with absolute fromFile', () => {
    expect(
      validateIncoming({
        type: 'mdview/internal-link-clicked',
        relPath: 'README.md',
        fromFile: '/etc/passwd',
      }),
    ).toBeNull();
  });

  it('rejects mdview/internal-link-clicked with missing relPath', () => {
    expect(
      validateIncoming({ type: 'mdview/internal-link-clicked', fromFile: 'README.md' }),
    ).toBeNull();
  });

  it('rejects mdview/heading-clicked with float line', () => {
    expect(
      validateIncoming({ type: 'mdview/heading-clicked', line: 1.5, file: 'README.md' }),
    ).toBeNull();
  });

  it('rejects mdview/heading-clicked with negative line', () => {
    expect(
      validateIncoming({ type: 'mdview/heading-clicked', line: -1, file: 'README.md' }),
    ).toBeNull();
  });

  it('rejects mdview/heading-clicked with line above cap', () => {
    expect(
      validateIncoming({ type: 'mdview/heading-clicked', line: 1_000_001, file: 'README.md' }),
    ).toBeNull();
  });

  it('rejects mdview/heading-clicked with traversal in file', () => {
    expect(
      validateIncoming({ type: 'mdview/heading-clicked', line: 5, file: '../secret.md' }),
    ).toBeNull();
  });

  it('rejects mdview/heading-clicked with missing file', () => {
    expect(validateIncoming({ type: 'mdview/heading-clicked', line: 5 })).toBeNull();
  });

  it('rejects mdview/error with non-string message', () => {
    expect(validateIncoming({ type: 'mdview/error', message: 42 })).toBeNull();
  });

  it('rejects mdview/error with missing message', () => {
    expect(validateIncoming({ type: 'mdview/error' })).toBeNull();
  });

  it('rejects a message with numeric type', () => {
    expect(validateIncoming({ type: 123 })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

describe('Dispatcher', () => {
  it('calls the matching handler for a valid message', () => {
    const calls: KnownIncomingMessage[] = [];
    const d = new Dispatcher({
      'mdview/ready': (msg) => calls.push(msg),
    });
    d.dispatch({ type: 'mdview/ready' });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.type).toBe('mdview/ready');
  });

  it('drops invalid messages silently without throwing', () => {
    const calls: KnownIncomingMessage[] = [];
    const d = new Dispatcher({
      'mdview/ready': (msg) => calls.push(msg),
    });
    expect(() => d.dispatch(null)).not.toThrow();
    expect(() => d.dispatch({ type: 'mdview/unknown' })).not.toThrow();
    expect(() => d.dispatch({ type: 'mdview/ready', extra: 'x' })).not.toThrow();
    // The valid ready message is dispatched; others are dropped.
    expect(calls).toHaveLength(1);
  });

  it('silently no-ops when there is no handler for the type', () => {
    const d = new Dispatcher({});
    expect(() => d.dispatch({ type: 'mdview/ready' })).not.toThrow();
  });

  it('does not throw when a handler throws', () => {
    const d = new Dispatcher({
      'mdview/ready': () => {
        throw new Error('handler error');
      },
    });
    expect(() => d.dispatch({ type: 'mdview/ready' })).not.toThrow();
  });

  it('passes validated payload to the handler', () => {
    let received: KnownIncomingMessage | null = null;
    const d = new Dispatcher({
      'mdview/heading-clicked': (msg) => {
        received = msg;
      },
    });
    d.dispatch({ type: 'mdview/heading-clicked', line: 5, file: 'README.md' });
    expect(received).toEqual({ type: 'mdview/heading-clicked', line: 5, file: 'README.md' });
  });

  it('drops a message that fails path validation but has the right type', () => {
    const calls: KnownIncomingMessage[] = [];
    const d = new Dispatcher({
      'mdview/internal-link-clicked': (msg) => calls.push(msg),
    });
    d.dispatch({
      type: 'mdview/internal-link-clicked',
      relPath: '../escape',
      fromFile: 'README.md',
    });
    expect(calls).toHaveLength(0);
  });
});
