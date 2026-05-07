import type { TreeNode } from './types.js';

/** Markdown file extensions recognized everywhere. */
export const MD_EXT = new Set(['.md', '.markdown', '.mdx']);

/** Strip a markdown extension from a path. */
export const MD_EXT_RE = /\.(md|markdown|mdx)$/i;

/**
 * Recursively walk a `TreeNode[]` collecting every markdown file's `relPath`.
 * In document order (matches what `walkFolder` produces).
 */
export function flattenMdRelPaths(nodes: TreeNode[], out: string[] = []): string[] {
  for (const n of nodes) {
    if (n.type === 'file' && n.isMarkdown) out.push(n.relPath);
    else if (n.type === 'dir' && n.children) flattenMdRelPaths(n.children, out);
  }
  return out;
}
