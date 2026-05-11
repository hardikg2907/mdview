import { useMemo, useState } from 'preact/hooks';
import type { HeadingLevel, OutlineNode } from '../../shared/types.js';
import { activeHeadingId } from '../hooks/useScrollSpy.js';
import { outlineLevelsSignal, toggleLevel } from '../hooks/useOutlineLevels.js';
import { filterOutline, ALL_LEVELS } from '../lib/outline-filter.js';
import { IconChevronRight, IconPanelRightClose } from './Icons.js';

interface Props {
  nodes: OutlineNode[];
  onJump: (id: string) => void;
  onCollapse: () => void;
}

export function Outline({ nodes, onJump, onCollapse }: Props) {
  const visible = outlineLevelsSignal.value;
  const filtered = useMemo(() => filterOutline(nodes, visible), [nodes, visible]);

  return (
    <nav class="outline" aria-label="Document outline">
      <div class="outline-head">
        <span class="outline-title">On this page</span>
        <div class="outline-head-actions">
          <div class="outline-level-pills" role="group" aria-label="Filter by heading level">
            {ALL_LEVELS.map((lvl) => {
              const on = visible.has(lvl);
              return (
                <button
                  key={lvl}
                  type="button"
                  class={`outline-level-pill${on ? ' is-on' : ''}`}
                  aria-pressed={on}
                  aria-label={`${on ? 'Hide' : 'Show'} heading level ${lvl}`}
                  data-tooltip={`${on ? 'Hide' : 'Show'} H${lvl}`}
                  onClick={() => toggleLevel(lvl)}
                >
                  {lvl}
                </button>
              );
            })}
          </div>
          <button
            class="pane-head-btn"
            aria-label="Hide outline"
            data-tooltip="Hide outline (⌘.)"
            data-tooltip-align="right"
            onClick={onCollapse}
          >
            <IconPanelRightClose size={14} />
          </button>
        </div>
      </div>
      {filtered.length === 0 ? (
        <div class="outline-empty">
          {nodes.length === 0 ? 'No headings' : 'All levels hidden'}
        </div>
      ) : (
        <ul>
          {filtered.map((n) => (
            <OutlineItem key={n.id} node={n} onJump={onJump} depth={0} />
          ))}
        </ul>
      )}
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

// re-export for callers that want to inspect the level type explicitly
export type { HeadingLevel };
