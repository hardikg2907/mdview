import { useMemo, useState } from 'preact/hooks';
import type { HeadingLevel, OutlineNode } from '../../shared/types.js';
import { activeHeadingId } from '../hooks/useScrollSpy.js';
import {
  outlineLevelsSignal,
  outlineMinLevelSignal,
  outlineMaxLevelSignal,
  setOutlineMinLevel,
  setOutlineMaxLevel,
  OUTLINE_LEVEL_MIN,
  OUTLINE_LEVEL_MAX,
} from '../hooks/useOutlineLevels.js';
import { filterOutline } from '../lib/outline-filter.js';
import { IconChevronRight, IconPanelRightClose } from './Icons.js';

interface Props {
  nodes: OutlineNode[];
  onJump: (id: string) => void;
  onCollapse: () => void;
}

export function Outline({ nodes, onJump, onCollapse }: Props) {
  const visible = outlineLevelsSignal.value;
  const min = outlineMinLevelSignal.value;
  const max = outlineMaxLevelSignal.value;
  const filtered = useMemo(() => filterOutline(nodes, visible), [nodes, visible]);
  const depthLabel = min === max ? `H${min}` : `H${min}–H${max}`;
  const span = OUTLINE_LEVEL_MAX - OUTLINE_LEVEL_MIN;
  const fillLeft = ((min - OUTLINE_LEVEL_MIN) / span) * 100;
  const fillRight = 100 - ((max - OUTLINE_LEVEL_MIN) / span) * 100;

  return (
    <nav class="outline" aria-label="Document outline">
      <div class="outline-head">
        <button
          class="pane-head-btn"
          aria-label="Hide outline"
          data-tooltip="Hide outline (⌘.)"
          data-tooltip-align="left"
          onClick={onCollapse}
        >
          <IconPanelRightClose size={14} />
        </button>
        <span class="outline-title">On this page</span>
        <div
          class="outline-depth"
          data-tooltip={`Show ${depthLabel}`}
          data-tooltip-align="right"
        >
          <span class="outline-depth-label" aria-hidden>{depthLabel}</span>
          <div class="outline-depth-range" role="group" aria-label="Heading depth range">
            <div class="outline-depth-track" aria-hidden>
              <div
                class="outline-depth-track-fill"
                style={`left:${fillLeft}%;right:${fillRight}%`}
              />
            </div>
            <input
              type="range"
              class="outline-depth-slider outline-depth-slider-min"
              min={OUTLINE_LEVEL_MIN}
              max={OUTLINE_LEVEL_MAX}
              step={1}
              value={min}
              aria-label={`Minimum heading level (currently H${min})`}
              onInput={(ev) => {
                const v = Number((ev.currentTarget as HTMLInputElement).value);
                if (Number.isFinite(v)) setOutlineMinLevel(v as HeadingLevel);
              }}
            />
            <input
              type="range"
              class="outline-depth-slider outline-depth-slider-max"
              min={OUTLINE_LEVEL_MIN}
              max={OUTLINE_LEVEL_MAX}
              step={1}
              value={max}
              aria-label={`Maximum heading level (currently H${max})`}
              onInput={(ev) => {
                const v = Number((ev.currentTarget as HTMLInputElement).value);
                if (Number.isFinite(v)) setOutlineMaxLevel(v as HeadingLevel);
              }}
            />
          </div>
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
