import type { OutlineNode } from '../../shared/types.js';
import { activeHeadingId } from '../hooks/useScrollSpy.js';

interface Props {
  outline: OutlineNode[];
  fileName: string | null;
  onJump: (id: string | null) => void;
}

function findPath(
  nodes: OutlineNode[],
  targetId: string,
  acc: OutlineNode[] = [],
): OutlineNode[] | null {
  for (const n of nodes) {
    const next = [...acc, n];
    if (n.id === targetId) return next;
    const deeper = findPath(n.children, targetId, next);
    if (deeper) return deeper;
  }
  return null;
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

export function Breadcrumbs({ outline, fileName, onJump }: Props) {
  const id = activeHeadingId.value;
  let path = id ? findPath(outline, id) ?? [] : [];

  if (
    fileName &&
    path.length > 0 &&
    path[0]?.level === 1 &&
    normalize(path[0].text) === normalize(fileName)
  ) {
    path = path.slice(1);
  }

  return (
    <nav class="breadcrumbs" aria-label="Current section">
      {fileName && (
        <button
          type="button"
          class="bc-item bc-root"
          onClick={() => onJump(null)}
          title="Scroll to top"
        >
          {fileName}
        </button>
      )}
      {path.map((node, i) => {
        const isCurrent = i === path.length - 1;
        return (
          <span key={node.id} class="bc-step">
            <span class="bc-sep" aria-hidden>›</span>
            <button
              type="button"
              class={`bc-item${isCurrent ? ' is-current' : ''}`}
              onClick={() => onJump(node.id)}
              aria-current={isCurrent ? 'location' : undefined}
            >
              {node.text}
            </button>
          </span>
        );
      })}
    </nav>
  );
}
