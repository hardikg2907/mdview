import { useEffect, useRef, useState } from 'preact/hooks';
import { useSignal } from '@preact/signals';
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
  const hits = useSignal<SearchHit[]>([]);
  const activeIdx = useSignal(0);
  const domCount = useSignal(0);
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
      hits.value = [];
      activeIdx.value = 0;
      domCount.value = 0;
      return;
    }
    const found = findHits(scroller, query);
    hits.value = found;
    activeIdx.value = 0;
    if (found.length > 0) {
      highlightHits(found, 0);
      const liveCount = scroller.querySelectorAll('mark.search-hit').length;
      domCount.value = liveCount;
      requestAnimationFrame(() => {
        const active = scroller.querySelector('mark.search-hit.is-active');
        active?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    } else {
      domCount.value = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, scroller, _fileTrigger]);

  // Update active mark when activeIdx changes
  useEffect(() => {
    if (!scroller || hits.value.length === 0) return;
    const active = setActiveMark(scroller, activeIdx.value);
    active?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Subscribe to activeIdx so this effect re-runs on change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdx.value, scroller, hits.value.length]);

  // Cleanup highlights on unmount
  useEffect(() => {
    return () => {
      if (scroller) clearHighlights(scroller);
    };
  }, [scroller]);

  function gotoNext() {
    if (hits.value.length === 0) return;
    activeIdx.value = (activeIdx.value + 1) % hits.value.length;
  }
  function gotoPrev() {
    if (hits.value.length === 0) return;
    activeIdx.value = (activeIdx.value - 1 + hits.value.length) % hits.value.length;
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
          ? domCount.value === 0
            ? 'No matches'
            : `${Math.min(activeIdx.value + 1, domCount.value)} / ${domCount.value}`
          : ''}
      </span>
      <button
        type="button"
        class="search-btn"
        onClick={gotoPrev}
        disabled={hits.value.length === 0}
        aria-label="Previous match"
        title="Previous (↑ / Shift+Enter)"
      >
        ↑
      </button>
      <button
        type="button"
        class="search-btn"
        onClick={gotoNext}
        disabled={hits.value.length === 0}
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
