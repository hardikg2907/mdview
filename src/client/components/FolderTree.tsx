import { useState } from 'preact/hooks';
import type { TreeNode } from '../../shared/types.js';

interface Props {
  tree: TreeNode[];
  currentPath: string | null;
  onSelect: (relPath: string) => void;
}

export function FolderTree({ tree, currentPath, onSelect }: Props) {
  return (
    <ul class="tree">
      {tree.map((node) => (
        <TreeItem key={node.relPath} node={node} currentPath={currentPath} onSelect={onSelect} depth={0} />
      ))}
    </ul>
  );
}

interface ItemProps {
  node: TreeNode;
  currentPath: string | null;
  onSelect: (relPath: string) => void;
  depth: number;
}

function TreeItem({ node, currentPath, onSelect, depth }: ItemProps) {
  const [open, setOpen] = useState(true);
  const pad = { paddingLeft: `${8 + depth * 14}px` };

  if (node.type === 'dir') {
    return (
      <li>
        <button class="tree-item tree-dir" style={pad} onClick={() => setOpen((o) => !o)}>
          <span class={`chev ${open ? 'open' : ''}`} aria-hidden>▸</span>
          <span class="name">{node.name}</span>
        </button>
        {open && node.children && (
          <ul>
            {node.children.map((c) => (
              <TreeItem key={c.relPath} node={c} currentPath={currentPath} onSelect={onSelect} depth={depth + 1} />
            ))}
          </ul>
        )}
      </li>
    );
  }

  const isMd = node.isMarkdown ?? false;
  const isCurrent = currentPath === node.relPath;
  return (
    <li>
      <button
        class={`tree-item tree-file ${isMd ? '' : 'is-disabled'} ${isCurrent ? 'is-current' : ''}`}
        style={pad}
        disabled={!isMd}
        onClick={() => isMd && onSelect(node.relPath)}
      >
        <span class="name">{node.name}</span>
      </button>
    </li>
  );
}
