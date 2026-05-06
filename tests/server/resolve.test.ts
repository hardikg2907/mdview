import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { resolveSafePath } from '../../src/server/fs/resolve.js';

describe('resolveSafePath', () => {
  const root = path.resolve('/tmp/mdview-fixture');

  it('resolves a relative path inside root', () => {
    const result = resolveSafePath(root, 'docs/intro.md');
    expect(result).toBe(path.join(root, 'docs/intro.md'));
  });

  it('rejects paths that escape root via ..', () => {
    expect(() => resolveSafePath(root, '../../etc/passwd')).toThrow(/outside root/);
  });

  it('rejects absolute paths', () => {
    expect(() => resolveSafePath(root, '/etc/passwd')).toThrow(/absolute/);
  });

  it('treats empty as root', () => {
    expect(resolveSafePath(root, '')).toBe(root);
  });

  it('normalizes redundant segments', () => {
    expect(resolveSafePath(root, './docs/./intro.md')).toBe(path.join(root, 'docs/intro.md'));
  });
});
