import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { paletteOpenSignal, closePalette } from '../hooks/useCommandPalette.js';
import { treeSignal } from '../hooks/useTree.js';
import { flattenMdFiles, rankAll, type RankedFile } from '../lib/file-search.js';

interface Props {
  currentPath: string | null;
  onSelect: (relPath: string) => void;
}

function highlight(path: string, ranges: Array<[number, number]>) {
  if (ranges.length === 0) return path;
  const parts: Array<string | { mark: string }> = [];
  let cursor = 0;
  for (const [a, b] of ranges) {
    if (a > cursor) parts.push(path.slice(cursor, a));
    parts.push({ mark: path.slice(a, b) });
    cursor = b;
  }
  if (cursor < path.length) parts.push(path.slice(cursor));
  return parts.map((p, i) =>
    typeof p === 'string'
      ? <span key={i}>{p}</span>
      : <mark key={i} class="palette-match">{p.mark}</mark>,
  );
}

export function CommandPalette({ currentPath, onSelect }: Props) {
  const open = paletteOpenSignal.value;
  const tree = treeSignal.value;
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  const allFiles = useMemo(() => {
    if (!tree) return [];
    return flattenMdFiles(tree.tree);
  }, [tree]);

  const ranked: RankedFile[] = useMemo(() => {
    if (!open) return [];
    if (!query.trim()) {
      // Show recent / all files at the start, current file last
      return allFiles
        .slice(0, 50)
        .map((f) => ({ ...f, score: 0, matchRanges: [] }));
    }
    return rankAll(allFiles, query.trim());
  }, [allFiles, query, open]);

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIdx(0);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [open]);

  // Clamp activeIdx if results shrink
  useEffect(() => {
    if (activeIdx >= ranked.length) setActiveIdx(Math.max(0, ranked.length - 1));
  }, [ranked.length, activeIdx]);

  // Scroll active into view
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.children[activeIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx, open]);

  if (!open) return null;

  function commit(idx: number) {
    const file = ranked[idx];
    if (!file) return;
    onSelect(file.relPath);
    closePalette();
  }

  function handleKeyDown(ev: KeyboardEvent) {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      closePalette();
    } else if (ev.key === 'ArrowDown' || (ev.ctrlKey && ev.key === 'n')) {
      ev.preventDefault();
      setActiveIdx((i) => (ranked.length === 0 ? 0 : (i + 1) % ranked.length));
    } else if (ev.key === 'ArrowUp' || (ev.ctrlKey && ev.key === 'p')) {
      ev.preventDefault();
      setActiveIdx((i) =>
        ranked.length === 0 ? 0 : (i - 1 + ranked.length) % ranked.length,
      );
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      commit(activeIdx);
    }
  }

  return (
    <div
      class="palette-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Switch file"
      onClick={closePalette}
    >
      <div class="palette" onClick={(ev) => ev.stopPropagation()}>
        <div class="palette-input-wrap">
          <span class="palette-prefix" aria-hidden>⌘P</span>
          <input
            ref={inputRef}
            type="text"
            class="palette-input"
            placeholder="Switch file…"
            value={query}
            onInput={(ev) => {
              setQuery((ev.target as HTMLInputElement).value);
              setActiveIdx(0);
            }}
            onKeyDown={handleKeyDown}
            aria-label="Find file"
          />
        </div>
        <ul class="palette-list" ref={listRef} role="listbox">
          {ranked.length === 0 && (
            <li class="palette-empty">No files match</li>
          )}
          {ranked.map((f, i) => {
            const isActive = i === activeIdx;
            const isCurrent = currentPath === f.relPath;
            const dirIdx = f.relPath.lastIndexOf('/');
            const dir = dirIdx >= 0 ? f.relPath.slice(0, dirIdx + 1) : '';
            const name = dirIdx >= 0 ? f.relPath.slice(dirIdx + 1) : f.relPath;
            return (
              <li
                key={f.relPath}
                class={`palette-item${isActive ? ' is-active' : ''}${isCurrent ? ' is-current' : ''}`}
                role="option"
                aria-selected={isActive}
                onMouseEnter={() => setActiveIdx(i)}
                onClick={() => commit(i)}
              >
                <span class="palette-item-name">
                  {f.matchRanges.length > 0
                    ? highlight(f.relPath, f.matchRanges)
                    : <>{dir && <span class="palette-dir">{dir}</span>}<span>{name}</span></>}
                </span>
                {isCurrent && <span class="palette-tag">current</span>}
              </li>
            );
          })}
        </ul>
        <div class="palette-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>Enter</kbd> open</span>
          <span><kbd>Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
