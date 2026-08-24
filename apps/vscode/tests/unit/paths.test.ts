import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { toWorkspaceRelPath, resolveInsideFolder } from '../../src/editor/paths';

describe('toWorkspaceRelPath', () => {
  it('returns the filename for a file directly inside the folder', () => {
    expect(toWorkspaceRelPath('/workspace', '/workspace/note.md')).toBe('note.md');
  });

  it('returns a forward-slash path for a file in a subdirectory', () => {
    expect(toWorkspaceRelPath('/workspace', '/workspace/docs/guide.md')).toBe('docs/guide.md');
  });

  it('returns null for a file outside the folder', () => {
    expect(toWorkspaceRelPath('/workspace', '/other/note.md')).toBeNull();
  });

  it('returns null when file path equals folder path', () => {
    expect(toWorkspaceRelPath('/workspace', '/workspace')).toBeNull();
  });
});

// resolveInsideFolder canonicalizes with realpath, so these run against a real
// temp fixture (with a real escaping symlink) rather than synthetic paths.
describe('resolveInsideFolder', () => {
  let tmp: string;
  let root: string; // the canonical workspace folder

  beforeAll(() => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mdview-paths-')));
    root = path.join(tmp, 'workspace');
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(root, 'note.md'), '# note');
    fs.writeFileSync(path.join(root, 'docs', 'guide.md'), '# guide');
    // A sibling outside the folder, plus a file the symlink will point at.
    fs.mkdirSync(path.join(tmp, 'outside'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'outside', 'secret.md'), 'secret');
    // A sibling folder that shares a name prefix with root.
    fs.mkdirSync(root + '-other', { recursive: true });
    fs.writeFileSync(path.join(root + '-other', 'note.md'), 'other');
    // A symlink INSIDE the folder that escapes it.
    try {
      fs.symlinkSync(path.join(tmp, 'outside'), path.join(root, 'link'), 'dir');
    } catch {
      /* symlink unsupported (e.g. unprivileged Windows) — the assertion below
         still holds via the nonexistent-target path. */
    }
  });

  afterAll(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('resolves a file directly inside the folder', () => {
    expect(resolveInsideFolder(root, 'note.md')).toBe(path.join(root, 'note.md'));
  });

  it('resolves a file in a subdirectory', () => {
    expect(resolveInsideFolder(root, 'docs/guide.md')).toBe(path.join(root, 'docs', 'guide.md'));
  });

  it('rejects empty input', () => {
    expect(resolveInsideFolder(root, '')).toBeNull();
  });

  it('rejects a nonexistent target (fail closed)', () => {
    expect(resolveInsideFolder(root, 'missing.md')).toBeNull();
  });

  it('rejects lexical traversal that escapes the folder', () => {
    expect(resolveInsideFolder(root, '../outside/secret.md')).toBeNull();
  });

  it('rejects a path that resolves to the folder root itself', () => {
    expect(resolveInsideFolder(root, '.')).toBeNull();
  });

  it('does not treat a sibling folder with a shared prefix as inside', () => {
    expect(resolveInsideFolder(root, `../${path.basename(root)}-other/note.md`)).toBeNull();
  });

  it('rejects a symlink inside the folder that points outside it', () => {
    // root/link -> tmp/outside, so link/secret.md canonicalizes outside root.
    expect(resolveInsideFolder(root, 'link/secret.md')).toBeNull();
  });
});
