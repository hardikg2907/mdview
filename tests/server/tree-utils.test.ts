import { describe, expect, it } from 'vitest';
import { flattenMdRelPaths, MD_EXT } from '../../src/shared/tree-utils.js';
import type { TreeNode } from '../../src/shared/types.js';

function file(relPath: string, isMarkdown = true): TreeNode {
  const name = relPath.split('/').pop()!;
  return { name, relPath, type: 'file', isMarkdown };
}

function dir(name: string, relPath: string, children: TreeNode[]): TreeNode {
  return { name, relPath, type: 'dir', children };
}

describe('MD_EXT', () => {
  it('recognizes .md, .markdown, .mdx', () => {
    expect(MD_EXT.has('.md')).toBe(true);
    expect(MD_EXT.has('.markdown')).toBe(true);
    expect(MD_EXT.has('.mdx')).toBe(true);
  });

  it('rejects unrelated extensions', () => {
    expect(MD_EXT.has('.txt')).toBe(false);
    expect(MD_EXT.has('.html')).toBe(false);
    expect(MD_EXT.has('')).toBe(false);
  });
});

describe('flattenMdRelPaths', () => {
  it('returns markdown files in document (walked) order', () => {
    const tree: TreeNode[] = [
      file('README.md'),
      dir('guides', 'guides', [file('guides/intro.md'), file('guides/advanced.md')]),
    ];
    expect(flattenMdRelPaths(tree)).toEqual([
      'README.md',
      'guides/intro.md',
      'guides/advanced.md',
    ]);
  });

  it('skips non-markdown files', () => {
    const tree: TreeNode[] = [
      file('README.md', true),
      file('image.png', false),
      file('script.js', false),
    ];
    expect(flattenMdRelPaths(tree)).toEqual(['README.md']);
  });

  it('recurses into nested directories', () => {
    const tree: TreeNode[] = [
      dir('a', 'a', [
        dir('b', 'a/b', [
          dir('c', 'a/b/c', [file('a/b/c/deep.md')]),
        ]),
      ]),
    ];
    expect(flattenMdRelPaths(tree)).toEqual(['a/b/c/deep.md']);
  });

  it('returns an empty array when no markdown files exist', () => {
    const tree: TreeNode[] = [
      file('a.png', false),
      dir('empty', 'empty', []),
    ];
    expect(flattenMdRelPaths(tree)).toEqual([]);
  });

  it('appends to provided accumulator', () => {
    const acc = ['existing.md'];
    const tree: TreeNode[] = [file('new.md')];
    const out = flattenMdRelPaths(tree, acc);
    expect(out).toBe(acc);
    expect(out).toEqual(['existing.md', 'new.md']);
  });

  it('treats dirs without children as empty', () => {
    const tree: TreeNode[] = [
      { name: 'orphan', relPath: 'orphan', type: 'dir' },
      file('top.md'),
    ];
    expect(flattenMdRelPaths(tree)).toEqual(['top.md']);
  });
});
