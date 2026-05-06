import type { OutlineNode } from '../../shared/types.js';
import { activeHeadingId } from '../hooks/useScrollSpy.js';

interface Props {
  outline: OutlineNode[];
  fileName: string | null;
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

export function Breadcrumbs({ outline, fileName }: Props) {
  const id = activeHeadingId.value;
  let path = id ? findPath(outline, id) ?? [] : [];

  // Strip a leading H1 entry if its text equals the file title (avoid duplicate).
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
      {fileName && <span class="bc-file">{fileName}</span>}
      {path.map((node) => (
        <span key={node.id} class="bc-item">
          <span class="bc-sep" aria-hidden>›</span>
          <span class="bc-text">{node.text}</span>
        </span>
      ))}
    </nav>
  );
}
