import { useEffect, useState } from 'preact/hooks';
import { DEFAULT_IGNORED_DIRS } from '../../shared/ignore.js';
import type { TreeNode } from '../../shared/types.js';
import {
  IconChevronRight,
  IconFile,
  IconFileMd,
  IconFolder,
  IconFolderOpen,
  IconInfo,
  IconPanelLeftClose,
} from './Icons.js';

const IGNORE_TOOLTIP = [
  'Hidden from the tree to keep the watcher under the OS file-watch limit:',
  '• dotfiles / dotdirs (.git, .next, .venv, …)',
  `• built-in heavy dirs: ${DEFAULT_IGNORED_DIRS.join(', ')}`,
  '',
  'Add your own in ~/.config/mdview/config.json:',
  '{ "ignore": ["my-build-dir"] }',
  '',
  'Restart mdview after editing.',
].join('\n');

interface Props {
  tree: TreeNode[];
  currentPath: string | null;
  onSelect: (relPath: string) => void;
  onCollapse: () => void;
}

export function FolderTree({ tree, currentPath, onSelect, onCollapse }: Props) {
  return (
    <div class="pane-content tree-pane">
      <div class="pane-head">
        <span class="pane-head-title">
          Files
          <span
            class="pane-head-info"
            role="button"
            tabIndex={0}
            aria-label="Why some folders aren't shown"
            data-tooltip={IGNORE_TOOLTIP}
            data-tooltip-multiline
            data-tooltip-align="left"
          >
            <IconInfo size={11} />
          </span>
        </span>
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
      {tree.length === 0 ? (
        <p class="tree-empty">
          No folders open. Run <code>mdview &lt;path&gt;</code> to add one.
        </p>
      ) : (
        <div class="tree-scroll">
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
      )}
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
  const isAncestor = currentPath?.startsWith(node.relPath + '/') ?? false;
  // A workspace root is the only depth-0 directory whose relPath is a bare id
  // with no separator — every other node carries its root's prefix. Roots start
  // expanded: collapsing the folder you just opened would hide everything.
  const isRoot = depth === 0 && !node.relPath.includes('/');
  const [open, setOpen] = useState(isAncestor || isRoot);
  useEffect(() => {
    if (isAncestor) setOpen(true);
  }, [currentPath]);
  if (node.type === 'dir') {
    return (
      <li class="tree-li tree-li-dir" role="treeitem" aria-expanded={open}>
        <button
          class={`tree-item tree-dir ${open ? 'is-open' : ''} ${isRoot ? 'tree-root' : ''}`}
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
          <ul class="tree-children">
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
        <span class={cls} title={node.name}>
          <span class="tree-icon" aria-hidden>
            <IconFile size={14} />
          </span>
          <span class="name">{node.name}</span>
        </span>
      )}
    </li>
  );
}
