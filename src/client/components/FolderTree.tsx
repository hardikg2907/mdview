import { useState } from 'preact/hooks';
import type { TreeNode } from '../../shared/types.js';
import { IconChevronRight, IconFolder, IconFolderOpen, IconFile, IconFileMd } from './Icons.js';

interface Props {
  tree: TreeNode[];
  currentPath: string | null;
  onSelect: (relPath: string) => void;
}

export function FolderTree({ tree, currentPath, onSelect }: Props) {
  return (
    <ul class="tree" role="tree">
      {tree.map((node) => (
        <TreeItem
          key={node.relPath}
          node={node}
          currentPath={currentPath}
          onSelect={onSelect}
          depth={0}
        />
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
  // Indent: leftmost gutter for guide rails + per-level offset.
  const indent = `${10 + depth * 14}px`;

  if (node.type === 'dir') {
    return (
      <li class="tree-li tree-li-dir" role="treeitem" aria-expanded={open}>
        <button
          class={`tree-item tree-dir ${open ? 'is-open' : ''}`}
          style={{ paddingLeft: indent }}
          onClick={() => setOpen((o) => !o)}
        >
          <span class={`chev ${open ? 'open' : ''}`} aria-hidden>
            <IconChevronRight size={12} />
          </span>
          <span class="tree-icon" aria-hidden>
            {open ? <IconFolderOpen size={15} /> : <IconFolder size={15} />}
          </span>
          <span class="name">{node.name}</span>
        </button>
        {open && node.children && node.children.length > 0 && (
          <ul class="tree-children" style={{ paddingLeft: `${10 + depth * 14 + 7}px` }}>
            {node.children.map((c) => (
              <TreeItem
                key={c.relPath}
                node={c}
                currentPath={currentPath}
                onSelect={onSelect}
                depth={depth + 1}
              />
            ))}
          </ul>
        )}
      </li>
    );
  }

  const isMd = node.isMarkdown ?? false;
  const isCurrent = currentPath === node.relPath;
  return (
    <li class="tree-li tree-li-file" role="treeitem">
      <button
        class={`tree-item tree-file ${isMd ? '' : 'is-disabled'} ${isCurrent ? 'is-current' : ''}`}
        style={{ paddingLeft: indent }}
        disabled={!isMd}
        onClick={() => isMd && onSelect(node.relPath)}
        title={node.name}
      >
        <span class="tree-icon" aria-hidden>
          {isMd ? <IconFileMd size={14} /> : <IconFile size={14} />}
        </span>
        <span class="name">{node.name}</span>
      </button>
    </li>
  );
}
