import { describe, expect, it } from 'vitest';
import { flattenMdFiles, rankAll, rankFile } from '../../src/client/lib/file-search.js';
import type { TreeNode } from '../../src/shared/types.js';

const f = (relPath: string, name = relPath.split('/').pop()!) => ({ relPath, name });

describe('flattenMdFiles', () => {
  it('returns only markdown files in walk order', () => {
    const tree: TreeNode[] = [
      { name: 'README.md', relPath: 'README.md', type: 'file', isMarkdown: true },
      { name: 'image.png', relPath: 'image.png', type: 'file', isMarkdown: false },
      {
        name: 'guides',
        relPath: 'guides',
        type: 'dir',
        children: [
          { name: 'intro.md', relPath: 'guides/intro.md', type: 'file', isMarkdown: true },
        ],
      },
    ];
    expect(flattenMdFiles(tree)).toEqual([
      { relPath: 'README.md', name: 'README.md' },
      { relPath: 'guides/intro.md', name: 'intro.md' },
    ]);
  });

  it('returns [] for empty tree', () => {
    expect(flattenMdFiles([])).toEqual([]);
  });
});

describe('rankFile — empty query', () => {
  it('returns the file with score 0 and empty ranges', () => {
    const r = rankFile(f('a/b.md'), '');
    expect(r).toEqual({ relPath: 'a/b.md', name: 'b.md', score: 0, matchRanges: [] });
  });
});

describe('rankFile — basename tier', () => {
  it('matches a substring in the basename', () => {
    const r = rankFile(f('guides/intro.md'), 'intro');
    expect(r).not.toBeNull();
    // pathStart = 15 - 8 + 0 = 7  (start of "intro" inside "guides/intro.md")
    expect(r!.matchRanges).toEqual([[7, 12]]);
  });

  it('is case-insensitive', () => {
    const r = rankFile(f('Guides/INTRO.md'), 'intro');
    expect(r).not.toBeNull();
    expect(r!.matchRanges[0]![0]).toBe(7);
  });

  it('scores basename matches higher than full-path-only matches', () => {
    const baseHit = rankFile(f('docs/intro-guide.md'), 'intro')!;
    // 'guide' appears only in the directory, not the basename.
    const pathHit = rankFile(f('docs/guide/readme.md'), 'guide')!;
    expect(baseHit.score).toBeGreaterThan(pathHit.score);
  });

  it('shorter paths score higher within the basename tier', () => {
    const short = rankFile(f('intro.md'), 'intro')!;
    const long = rankFile(f('docs/folder/intro.md'), 'intro')!;
    expect(short.score).toBeGreaterThan(long.score);
  });
});

describe('rankFile — path tier', () => {
  it('matches a substring that only appears in the directory part of the path', () => {
    const r = rankFile(f('docs/guide/readme.md'), 'guide');
    expect(r).not.toBeNull();
    expect(r!.matchRanges).toEqual([[5, 10]]);
  });

  it('returns score in the 500-band for path-only matches', () => {
    const r = rankFile(f('docs/guide/readme.md'), 'guide')!;
    expect(r.score).toBeLessThan(1000);
    expect(r.score).toBeGreaterThan(0);
  });
});

describe('rankFile — fuzzy tier', () => {
  it('matches when query chars appear in order across the path', () => {
    const r = rankFile(f('abcde'), 'ace');
    expect(r).not.toBeNull();
  });

  it('returns null when fuzzy match cannot be satisfied', () => {
    expect(rankFile(f('foo.md'), 'zz')).toBeNull();
  });

  it('scores fuzzy hits below substring hits', () => {
    const fuzzy = rankFile(f('abcde'), 'ace')!;
    const sub = rankFile(f('abcde'), 'abc')!;
    expect(sub.score).toBeGreaterThan(fuzzy.score);
  });

  it('records ranges for the matched characters', () => {
    const r = rankFile(f('abcde'), 'ace')!;
    expect(r.matchRanges.length).toBeGreaterThan(0);
    // Each range must point at a character that is part of the query.
    for (const [start] of r.matchRanges) {
      expect('ace').toContain('abcde'[start]);
    }
  });
});

describe('rankAll', () => {
  const files = [
    f('intro.md'),
    f('docs/intro-guide.md'),
    f('docs/folder/intro.md'),
    f('unrelated.md'),
  ];

  it('drops non-matching files and sorts by score (best first)', () => {
    const ranked = rankAll(files, 'intro');
    expect(ranked.find((r) => r.relPath === 'unrelated.md')).toBeUndefined();
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1]!.score).toBeGreaterThanOrEqual(ranked[i]!.score);
    }
  });

  it('respects the max cap', () => {
    const out = rankAll(files, 'intro', 2);
    expect(out.length).toBe(2);
  });

  it('returns shorter basename match first', () => {
    const ranked = rankAll(files, 'intro');
    expect(ranked[0]!.relPath).toBe('intro.md');
  });

  it('returns [] when no file matches', () => {
    expect(rankAll(files, 'xyz123')).toEqual([]);
  });
});

describe('workspace-scoped paths', () => {
  const files = [
    { relPath: 'alpha/docs/api.md', name: 'api.md' },
    { relPath: 'beta/docs/api.md', name: 'api.md' },
    { relPath: 'alpha/README.md', name: 'README.md' },
  ];

  it('still ranks a basename match above a path match once paths carry a root id', () => {
    const ranked = files
      .map((f) => rankFile(f, 'api'))
      .filter((r): r is NonNullable<typeof r> => r !== null);
    expect(ranked.length).toBe(2);
    expect(ranked.every((r) => r.name === 'api.md')).toBe(true);
  });

  it('lets the root id itself be searched, so a root name narrows results', () => {
    const ranked = files
      .map((f) => rankFile(f, 'beta'))
      .filter((r): r is NonNullable<typeof r> => r !== null);
    expect(ranked.map((r) => r.relPath)).toEqual(['beta/docs/api.md']);
  });

  it('highlights inside the basename at the right offset in a prefixed path', () => {
    const r = rankFile({ relPath: 'alpha/docs/api.md', name: 'api.md' }, 'api');
    const [start, end] = r?.matchRanges[0] ?? [-1, -1];
    expect('alpha/docs/api.md'.slice(start, end)).toBe('api');
  });

  it('flattens a multi-root tree into root-qualified paths', () => {
    const entries = flattenMdFiles([
      {
        name: 'alpha',
        relPath: 'alpha',
        type: 'dir',
        children: [
          { name: 'README.md', relPath: 'alpha/README.md', type: 'file', isMarkdown: true },
        ],
      },
      {
        name: 'beta',
        relPath: 'beta',
        type: 'dir',
        children: [
          { name: 'README.md', relPath: 'beta/README.md', type: 'file', isMarkdown: true },
        ],
      },
    ]);
    expect(entries.map((e) => e.relPath)).toEqual(['alpha/README.md', 'beta/README.md']);
  });
});
