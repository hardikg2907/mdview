import { useEffect, useState } from 'preact/hooks';
import type { TreeNode } from '../../shared/types.js';
import {
  IconChevronRight,
  IconFolder,
  IconFolderOpen,
  IconFile,
  IconFileMd,
  IconPanelLeftClose,
} from './Icons.js';

interface Props {
  tree: TreeNode[];
  currentPath: string | null;
  onSelect: (relPath: string) => void;
  onCollapse: () => void;
}

export function FolderTree({ tree, currentPath, onSelect, onCollapse }: Props) {
  return (
    <div class="pane-content">
      <div class="pane-head">
        <span class="pane-head-title">Files</span>
        <button
          class="pane-head-btn"
          aria-label="Hide file tree"
          data-tooltip="Hide file tree (⌘B)"
          data-tooltip-align="right"
          onClick={onCollapse}
        >
          <IconPanelLeftClose size={14} />
        </button>
      </div>
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
    </div>
  );
}

interface ItemProps {
  node: TreeNode;
  currentPath: string | null;
  onSelect: (relPath: string) => void;
  depth: number;
}

function TreeItem({ node, currentPath, onSelect, depth }: ItemProps) {
  const isAncestor = currentPath !== null && currentPath.startsWith(node.relPath + '/');
  const [open, setOpen] = useState(isAncestor);
  useEffect(() => {
    if (isAncestor) setOpen(true);
  }, [currentPath]);
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
  const cls = `tree-item tree-file ${isMd ? '' : 'is-disabled'} ${isCurrent ? 'is-current' : ''}`;
  // Render as a real <a> so the browser handles cmd/ctrl-click (new tab),
  // middle-click (new tab), and right-click → "Open in new tab" natively.
  // encodeURIComponent on relPath keeps user-controlled segments from breaking
  // out of the query value or smuggling CR/LF into the URL.
  const href = isMd ? `/?file=${encodeURIComponent(node.relPath)}` : undefined;
  return (
    <li class="tree-li tree-li-file" role="treeitem">
      {isMd ? (
        <a
          class={cls}
          style={{ paddingLeft: indent }}
          href={href}
          title={node.name}
          onClick={(e) => {
            // Let the browser handle modifier-clicks natively (new tab/window).
            // Middle-click fires `auxclick`, not `click`, so it bypasses this
            // handler entirely and the browser opens the href in a new tab.
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            e.preventDefault();
            onSelect(node.relPath);
          }}
        >
          <span class="tree-icon" aria-hidden>
            <IconFileMd size={14} />
          </span>
          <span class="name">{node.name}</span>
        </a>
      ) : (
        <span class={cls} style={{ paddingLeft: indent }} title={node.name}>
          <span class="tree-icon" aria-hidden>
            <IconFile size={14} />
          </span>
          <span class="name">{node.name}</span>
        </span>
      )}
    </li>
  );
}
