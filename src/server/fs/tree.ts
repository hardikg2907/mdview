import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { MD_EXT } from '../../shared/tree-utils.js';
import type { TreeNode } from '../../shared/types.js';

export async function walkFolder(root: string, relBase = ''): Promise<TreeNode[]> {
  const absDir = path.join(root, relBase);
  const entries = await readdir(absDir, { withFileTypes: true });

  const out: TreeNode[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (entry.name === 'node_modules') continue;

    const childRel = relBase ? `${relBase}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      const children = await walkFolder(root, childRel);
      out.push({
        name: entry.name,
        relPath: childRel,
        type: 'dir',
        children,
      });
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      out.push({
        name: entry.name,
        relPath: childRel,
        type: 'file',
        isMarkdown: MD_EXT.has(ext),
      });
    }
  }

  out.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return out;
}
