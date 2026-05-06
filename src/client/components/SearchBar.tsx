import { useEffect, useRef, useState } from 'preact/hooks';
import {
  clearHighlights,
  findHits,
  highlightHits,
  setActiveMark,
  type SearchHit,
} from '../lib/search.js';
import { closeSearch } from '../hooks/useSearch.js';

interface Props {
  scroller: HTMLElement | null;
  fileTrigger: unknown;
}

export function SearchBar({ scroller, fileTrigger: _fileTrigger }: Props) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // Re-run search when query changes
  useEffect(() => {
    if (!scroller) return;
    clearHighlights(scroller);
    if (!query.trim()) {
      setHits([]);
      setActiveIdx(0);
      return;
    }
    const found = findHits(scroller, query);
    setHits(found);
    setActiveIdx(0);
    if (found.length > 0) {
      highlightHits(found, 0);
      requestAnimationFrame(() => {
        const active = scroller.querySelector('mark.search-hit.is-active');
        active?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
  }, [query, scroller, _fileTrigger]);

  // Update active mark when activeIdx changes
  useEffect(() => {
    if (!scroller || hits.length === 0) return;
    const active = setActiveMark(scroller, activeIdx);
    active?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activeIdx, scroller, hits.length]);

  // Cleanup highlights on unmount
  useEffect(() => {
    return () => {
      if (scroller) clearHighlights(scroller);
    };
  }, [scroller]);

  function gotoNext() {
    if (hits.length === 0) return;
    setActiveIdx((i) => (i + 1) % hits.length);
  }
  function gotoPrev() {
    if (hits.length === 0) return;
    setActiveIdx((i) => (i - 1 + hits.length) % hits.length);
  }

  function handleKeyDown(ev: KeyboardEvent) {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      closeSearch();
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      if (ev.shiftKey) gotoPrev();
      else gotoNext();
    } else if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      gotoNext();
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      gotoPrev();
    }
  }

  return (
    <div class="search-bar" role="search" aria-label="Find in document">
      <input
        ref={inputRef}
        type="search"
        class="search-input"
        placeholder="Find in document"
        value={query}
        onInput={(ev) => setQuery((ev.target as HTMLInputElement).value)}
        onKeyDown={handleKeyDown}
        aria-label="Search query"
      />
      <span class="search-count" aria-live="polite">
        {query.trim()
          ? hits.length === 0
            ? 'No matches'
            : `${activeIdx + 1} / ${hits.length}`
          : ''}
      </span>
      <button
        type="button"
        class="search-btn"
        onClick={gotoPrev}
        disabled={hits.length === 0}
        aria-label="Previous match"
        title="Previous (↑ / Shift+Enter)"
      >
        ↑
      </button>
      <button
        type="button"
        class="search-btn"
        onClick={gotoNext}
        disabled={hits.length === 0}
        aria-label="Next match"
        title="Next (↓ / Enter)"
      >
        ↓
      </button>
      <button
        type="button"
        class="search-btn search-close"
        onClick={closeSearch}
        aria-label="Close search"
        title="Close (Esc)"
      >
        ×
      </button>
    </div>
  );
}
