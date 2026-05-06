import type { OutlineNode } from '../../shared/types.js';
import { activeHeadingId } from '../hooks/useScrollSpy.js';

interface Props {
  outline: OutlineNode[];
  fileName: string | null;
}

function findPath(nodes: OutlineNode[], targetId: string, acc: OutlineNode[] = []): OutlineNode[] | null {
  for (const n of nodes) {
    const next = [...acc, n];
    if (n.id === targetId) return next;
    const deeper = findPath(n.children, targetId, next);
    if (deeper) return deeper;
  }
  return null;
}

export function Breadcrumbs({ outline, fileName }: Props) {
  const id = activeHeadingId.value;
  const path = id ? findPath(outline, id) ?? [] : [];

  return (
    <nav class="breadcrumbs" aria-label="Current section">
      {fileName && <span class="bc-file">{fileName}</span>}
      {path.map((node) => (
        <span key={node.id} class="bc-item">
          <span class="bc-sep">›</span>
          <span class="bc-text">{node.text}</span>
        </span>
      ))}
    </nav>
  );
}
