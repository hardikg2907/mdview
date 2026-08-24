import { describe, expect, it } from 'vitest';
import { shouldReloadFile } from '../../src/client/hooks/useLiveReload.js';
import type { RenderedFile, WatchEvent } from '../../src/shared/types.js';

function file(relPath: string): RenderedFile {
  return {
    relPath,
    html: '',
    outline: [],
    frontmatter: null,
    title: null,
    lastModified: 0,
  };
}

const change = (relPath: string): WatchEvent => ({ kind: 'change', relPath });

describe('shouldReloadFile', () => {
  it('reloads when the event names the open document', () => {
    expect(shouldReloadFile(change('docs/a.md'), file('docs/a.md'), 'docs/a.md')).toBe(true);
  });

  it('reloads when the request was unprefixed and the server canonicalised it', () => {
    // The regression this guards: a pre-workspace bookmark or the VS Code
    // extension asks for `a.md`, the server resolves it against the primary root
    // and answers `notes/a.md`, and every watch event uses that scoped form.
    // Comparing against the requested path would never match, and the page would
    // quietly stop updating on save.
    expect(shouldReloadFile(change('notes/a.md'), file('notes/a.md'), 'a.md')).toBe(true);
  });

  it('ignores a file with the same name in a different root', () => {
    expect(shouldReloadFile(change('other/a.md'), file('notes/a.md'), 'notes/a.md')).toBe(false);
  });

  it('ignores a different file in the same root', () => {
    expect(shouldReloadFile(change('notes/b.md'), file('notes/a.md'), 'notes/a.md')).toBe(false);
  });

  it('falls back to the requested path before anything has loaded', () => {
    expect(shouldReloadFile(change('notes/a.md'), null, 'notes/a.md')).toBe(true);
    expect(shouldReloadFile(change('notes/a.md'), null, 'other/a.md')).toBe(false);
  });

  it('does not match when nothing is open', () => {
    expect(shouldReloadFile(change('notes/a.md'), null, null)).toBe(false);
  });

  it('only answers for change events', () => {
    for (const e of [
      { kind: 'add', relPath: 'notes/a.md' },
      { kind: 'unlink', relPath: 'notes/a.md' },
      { kind: 'config', relPath: 'notes/.mdview.json' },
      { kind: 'workspace' },
    ] as WatchEvent[]) {
      expect(shouldReloadFile(e, file('notes/a.md'), 'notes/a.md'), e.kind).toBe(false);
    }
  });
});
