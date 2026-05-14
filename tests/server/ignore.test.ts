import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  DEFAULT_IGNORED_DIRS,
  buildIgnoreSet,
  isDirIgnored,
  isPathIgnored,
} from '../../src/server/fs/ignore.js';

describe('ignore: built-in defaults', () => {
  it('covers the well-known heavy dirs', () => {
    for (const name of ['node_modules', 'dist', 'build', '_build', 'target', '__pycache__']) {
      expect(DEFAULT_IGNORED_DIRS.has(name)).toBe(true);
    }
  });
});

describe('ignore: buildIgnoreSet', () => {
  it('unions defaults with user extras', () => {
    const set = buildIgnoreSet(['my-bulk', 'fixtures']);
    expect(set.has('node_modules')).toBe(true);
    expect(set.has('my-bulk')).toBe(true);
    expect(set.has('fixtures')).toBe(true);
  });

  it('returns defaults verbatim when given no extras', () => {
    const set = buildIgnoreSet();
    expect(set.has('node_modules')).toBe(true);
    expect(set.has('made-up')).toBe(false);
  });
});

describe('ignore: isDirIgnored', () => {
  const set = buildIgnoreSet(['stuff']);
  it('skips dotfiles regardless of set membership', () => {
    expect(isDirIgnored('.git', set)).toBe(true);
    expect(isDirIgnored('.cache', set)).toBe(true);
  });
  it('skips set members', () => {
    expect(isDirIgnored('node_modules', set)).toBe(true);
    expect(isDirIgnored('stuff', set)).toBe(true);
  });
  it('keeps normal names', () => {
    expect(isDirIgnored('docs', set)).toBe(false);
    expect(isDirIgnored('README.md', set)).toBe(false);
  });
});

describe('ignore: isPathIgnored', () => {
  const root = path.resolve('/tmp/proj');
  const set = buildIgnoreSet();

  it('returns false for the root itself', () => {
    expect(isPathIgnored(root, root, set)).toBe(false);
  });

  it('flags any segment that matches', () => {
    expect(isPathIgnored(path.join(root, 'node_modules', 'foo', 'bar.js'), root, set)).toBe(true);
    expect(isPathIgnored(path.join(root, 'pkg', '_build', 'dev', 'x.beam'), root, set)).toBe(true);
  });

  it('flags dotfile segments at any depth', () => {
    expect(isPathIgnored(path.join(root, '.git', 'HEAD'), root, set)).toBe(true);
    expect(isPathIgnored(path.join(root, 'src', '.cache', 'x'), root, set)).toBe(true);
  });

  it('returns false for paths outside the root', () => {
    expect(isPathIgnored('/etc/passwd', root, set)).toBe(false);
  });

  it('passes ordinary files through', () => {
    expect(isPathIgnored(path.join(root, 'docs', 'readme.md'), root, set)).toBe(false);
  });
});
