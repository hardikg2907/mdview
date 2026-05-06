import { useState } from 'preact/hooks';
import type { OutlineNode } from '../../shared/types.js';
import { activeHeadingId } from '../hooks/useScrollSpy.js';
import { IconChevronRight } from './Icons.js';

interface Props {
  nodes: OutlineNode[];
  onJump: (id: string) => void;
}

export function Outline({ nodes, onJump }: Props) {
  if (nodes.length === 0) return <div class="outline-empty">No headings</div>;
  return (
    <nav class="outline" aria-label="Document outline">
      <div class="outline-title">On this page</div>
      <ul>
        {nodes.map((n) => (
          <OutlineItem key={n.id} node={n} onJump={onJump} depth={0} />
        ))}
      </ul>
    </nav>
  );
}

interface ItemProps {
  node: OutlineNode;
  onJump: (id: string) => void;
  depth: number;
}

function OutlineItem({ node, onJump, depth }: ItemProps) {
  const [collapsed, setCollapsed] = useState(false);
  const hasChildren = node.children.length > 0;
  const isActive = activeHeadingId.value === node.id;
  // Cap depth styling at 5 to avoid runaway indent
  const cappedDepth = Math.min(depth, 5);

  return (
    <li class={`outline-li depth-${cappedDepth}`}>
      <div class={`outline-row ${isActive ? 'is-active' : ''}`}>
        {hasChildren ? (
          <button
            class={`outline-toggle ${collapsed ? '' : 'open'}`}
            aria-label={collapsed ? 'Expand section' : 'Collapse section'}
            onClick={(e) => {
              e.stopPropagation();
              setCollapsed((c) => !c);
            }}
          >
            <IconChevronRight size={11} />
          </button>
        ) : (
          <span class="outline-toggle is-spacer" aria-hidden />
        )}
        <button
          class="outline-link"
          onClick={() => onJump(node.id)}
          title={node.text}
        >
          {node.text}
        </button>
      </div>
      {hasChildren && !collapsed && (
        <ul class="outline-children">
          {node.children.map((c) => (
            <OutlineItem key={c.id} node={c} onJump={onJump} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}
