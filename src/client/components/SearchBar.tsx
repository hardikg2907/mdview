import { useSignal } from '@preact/signals';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  closeSearch,
  type SearchScope,
  searchCaseSensitiveSignal,
  searchRegexSignal,
  searchScopeSignal,
  searchWholeWordSignal,
  setSearchScope,
  toggleSearchCase,
  toggleSearchRegex,
  toggleSearchWord,
} from '../hooks/useSearch.js';
import { expandSectionContainingElement } from '../lib/collapsible-sections.js';
import { debounce } from '../lib/debounce.js';
import {
  type FolderSearchResults,
  fetchFolderSearch,
} from '../lib/folder-search.js';
import {
  clearHighlights,
  findHits,
  highlightHits,
  type SearchHit,
  setActiveMark,
} from '../lib/search.js';

interface Props {
  scroller: HTMLElement | null;
  fileTrigger: unknown;
  onOpenFile: (relPath: string) => void;
}

const FOLDER_DEBOUNCE_MS = 250;
const DOC_DEBOUNCE_MS = 150;

export function SearchBar({ scroller, fileTrigger: _fileTrigger, onOpenFile }: Props) {
  const [query, setQuery] = useState('');
  const scope = searchScopeSignal.value;
  const caseSensitive = searchCaseSensitiveSignal.value;
  const wholeWord = searchWholeWordSignal.value;
  const regexMode = searchRegexSignal.value;
  const inputRef = useRef<HTMLInputElement | null>(null);

  // ===== Doc-mode state =====
  const hits = useSignal<SearchHit[]>([]);
  const activeIdx = useSignal(0);
  const domCount = useSignal(0);

  // ===== Folder-mode state =====
  const folderResults = useSignal<FolderSearchResults | null>(null);
  const folderLoading = useSignal(false);
  const folderError = useSignal<string | null>(null);
  const folderActive = useSignal(0);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // Doc-mode search effect (debounced for typing; immediate clears for empty)
  const runDocSearch = useMemo(
    () =>
      debounce(
        (
          el: HTMLElement,
          q: string,
          opts: { caseSensitive: boolean; wholeWord: boolean; regex: boolean },
        ) => {
          clearHighlights(el);
          const found = findHits(el, q, opts);
          hits.value = found;
          activeIdx.value = 0;
          if (found.length > 0) {
            highlightHits(found, 0);
            domCount.value = el.querySelectorAll('mark.search-hit').length;
            requestAnimationFrame(() => {
              const active = el.querySelector<HTMLElement>('mark.search-hit.is-active');
              if (active) {
                expandSectionContainingElement(active);
                active.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            });
          } else {
            domCount.value = 0;
          }
        },
        DOC_DEBOUNCE_MS,
      ),
    // hits/activeIdx/domCount are stable signal references
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    if (scope !== 'doc') return;
    if (!scroller) return;
    if (!query.trim()) {
      runDocSearch.cancel();
      clearHighlights(scroller);
      hits.value = [];
      activeIdx.value = 0;
      domCount.value = 0;
      return;
    }
    runDocSearch(scroller, query, { caseSensitive, wholeWord, regex: regexMode });
    return () => runDocSearch.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, scope, scroller, _fileTrigger, caseSensitive, wholeWord, regexMode]);

  // Update active mark in doc mode when activeIdx changes
  useEffect(() => {
    if (scope !== 'doc') return;
    if (!scroller || hits.value.length === 0) return;
    const active = setActiveMark(scroller, activeIdx.value);
    if (active) {
      expandSectionContainingElement(active);
      active.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdx.value, scope, scroller, hits.value.length]);

  // Folder-mode debounced fetch
  const folderAbortRef = useRef<AbortController | null>(null);
  const runFolderSearch = useMemo(
    () =>
      debounce(
        (
          q: string,
          opts: { caseSensitive: boolean; wholeWord: boolean; regex: boolean },
        ) => {
          folderAbortRef.current?.abort();
          const ctl = new AbortController();
          folderAbortRef.current = ctl;
          (async () => {
            try {
              const res = await fetchFolderSearch(q, opts, ctl.signal);
              if (ctl.signal.aborted) return;
              folderResults.value = res;
              folderError.value = null;
              folderActive.value = 0;
            } catch (err) {
              if ((err as Error).name === 'AbortError') return;
              folderError.value = (err as Error).message;
            } finally {
              if (folderAbortRef.current === ctl) folderAbortRef.current = null;
              if (!ctl.signal.aborted) folderLoading.value = false;
            }
          })();
        },
        FOLDER_DEBOUNCE_MS,
      ),
    // signal refs and the abort ref are stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    if (scope !== 'folder') return;
    if (!query.trim()) {
      runFolderSearch.cancel();
      folderAbortRef.current?.abort();
      folderAbortRef.current = null;
      folderResults.value = null;
      folderError.value = null;
      folderLoading.value = false;
      return;
    }
    folderLoading.value = true;
    runFolderSearch(query.trim(), { caseSensitive, wholeWord, regex: regexMode });
    return () => {
      runFolderSearch.cancel();
      folderAbortRef.current?.abort();
      folderAbortRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, scope, caseSensitive, wholeWord, regexMode]);

  // Cleanup highlights on unmount and when leaving doc mode
  useEffect(() => {
    return () => {
      if (scroller) clearHighlights(scroller);
    };
  }, [scroller]);

  useEffect(() => {
    if (scope !== 'doc' && scroller) clearHighlights(scroller);
  }, [scope, scroller]);

  // ===== Hit navigation =====
  function gotoNext() {
    if (scope === 'doc') {
      if (hits.value.length === 0) return;
      activeIdx.value = (activeIdx.value + 1) % hits.value.length;
    } else {
      const flat = flattenFolderHits(folderResults.value);
      if (flat.length === 0) return;
      folderActive.value = (folderActive.value + 1) % flat.length;
    }
  }
  function gotoPrev() {
    if (scope === 'doc') {
      if (hits.value.length === 0) return;
      activeIdx.value = (activeIdx.value - 1 + hits.value.length) % hits.value.length;
    } else {
      const flat = flattenFolderHits(folderResults.value);
      if (flat.length === 0) return;
      folderActive.value = (folderActive.value - 1 + flat.length) % flat.length;
    }
  }
  function commitFolderHit(): void {
    const flat = flattenFolderHits(folderResults.value);
    const target = flat[folderActive.value];
    if (target) {
      onOpenFile(target.relPath);
      closeSearch();
    }
  }

  function setScope(next: SearchScope) {
    if (next === scope) return;
    setSearchScope(next);
  }

  function handleKeyDown(ev: KeyboardEvent) {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      closeSearch();
    } else if (ev.key === 'Tab') {
      ev.preventDefault();
      setScope(scope === 'doc' ? 'folder' : 'doc');
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      if (scope === 'doc') {
        if (ev.shiftKey) gotoPrev();
        else gotoNext();
      } else {
        commitFolderHit();
      }
    } else if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      gotoNext();
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      gotoPrev();
    }
  }

  return (
    <div class="search-bar" role="search" aria-label="Find">
      <div class="search-scope" role="tablist" aria-label="Search scope">
        <button
          type="button"
          role="tab"
          aria-selected={scope === 'doc'}
          class={`scope-pill${scope === 'doc' ? ' is-active' : ''}`}
          data-tooltip="Search in document (Tab)"
          data-tooltip-side="top"
          onClick={() => setScope('doc')}
          tabIndex={-1}
        >
          Doc
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={scope === 'folder'}
          class={`scope-pill${scope === 'folder' ? ' is-active' : ''}`}
          data-tooltip="Search across folder (⇧⌘F)"
          data-tooltip-side="top"
          onClick={() => setScope('folder')}
          tabIndex={-1}
        >
          Folder
        </button>
      </div>
      <input
        ref={inputRef}
        type="search"
        class="search-input"
        placeholder={scope === 'doc' ? 'Find in document' : 'Find in folder'}
        value={query}
        onInput={(ev) => setQuery((ev.target as HTMLInputElement).value)}
        onKeyDown={handleKeyDown}
        aria-label="Search query"
      />
      <div class="search-options" role="group" aria-label="Search options">
        <button
          type="button"
          class={`search-opt${caseSensitive ? ' is-on' : ''}`}
          aria-pressed={caseSensitive}
          title="Match case"
          onClick={toggleSearchCase}
          tabIndex={-1}
        >
          Aa
        </button>
        <button
          type="button"
          class={`search-opt${wholeWord ? ' is-on' : ''}`}
          aria-pressed={wholeWord}
          title="Whole word"
          onClick={toggleSearchWord}
          tabIndex={-1}
        >
          ab
        </button>
        <button
          type="button"
          class={`search-opt${regexMode ? ' is-on' : ''}`}
          aria-pressed={regexMode}
          title="Regular expression"
          onClick={toggleSearchRegex}
          tabIndex={-1}
        >
          .*
        </button>
      </div>
      <span class="search-count" aria-live="polite">
        {countLabel(
          scope,
          query.trim(),
          activeIdx.value,
          domCount.value,
          folderLoading.value,
          folderResults.value,
        )}
      </span>
      <button
        type="button"
        class="search-btn"
        onClick={gotoPrev}
        aria-label="Previous match"
        title="Previous (↑ / Shift+Enter)"
      >
        ↑
      </button>
      <button
        type="button"
        class="search-btn"
        onClick={gotoNext}
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

      {scope === 'folder' && (
        <FolderResults
          state={folderResults.value}
          loading={folderLoading.value}
          error={folderError.value}
          query={query.trim()}
          activeIndex={folderActive.value}
          onHover={(idx) => (folderActive.value = idx)}
          onPick={(idx) => {
            folderActive.value = idx;
            commitFolderHit();
          }}
        />
      )}
    </div>
  );
}

interface FlatHit {
  relPath: string;
  fileTotal: number;
  fileTruncated: boolean;
  hit: { line: number; snippet: string; highlight: [number, number] };
}

function flattenFolderHits(res: FolderSearchResults | null): FlatHit[] {
  if (!res) return [];
  const out: FlatHit[] = [];
  for (const file of res.results) {
    for (const hit of file.hits) {
      out.push({
        relPath: file.relPath,
        fileTotal: file.total,
        fileTruncated: file.truncated,
        hit,
      });
    }
  }
  return out;
}

function folderSummary(res: FolderSearchResults): string {
  if (res.results.length === 0) return 'No matches';
  const total = res.results.reduce((n, r) => n + r.total, 0);
  const fileWord = res.results.length === 1 ? 'file' : 'files';
  const more = res.truncated ? '+' : '';
  return `${total}${more} hits in ${res.results.length} ${fileWord}`;
}

function countLabel(
  scope: SearchScope,
  query: string,
  activeIdx: number,
  domCount: number,
  folderLoading: boolean,
  folderResults: FolderSearchResults | null,
): string {
  if (scope === 'doc') {
    if (!query) return '';
    if (domCount === 0) return 'No matches';
    return `${Math.min(activeIdx + 1, domCount)} / ${domCount}`;
  }
  if (folderLoading) return '…';
  if (folderResults) return folderSummary(folderResults);
  return '';
}

interface FolderResultsProps {
  state: FolderSearchResults | null;
  loading: boolean;
  error: string | null;
  query: string;
  activeIndex: number;
  onHover: (i: number) => void;
  onPick: (i: number) => void;
}

function FolderResults({
  state, loading, error, query, activeIndex, onHover, onPick,
}: FolderResultsProps) {
  if (!query) return null;
  if (loading && !state) {
    return <div class="search-results"><div class="search-empty">Searching…</div></div>;
  }
  if (error) {
    return <div class="search-results"><div class="search-empty">Error: {error}</div></div>;
  }
  if (!state || state.results.length === 0) {
    return <div class="search-results"><div class="search-empty">No matches</div></div>;
  }
  let cursor = 0;
  return (
    <div class="search-results">
      {state.results.map((file) => (
        <section key={file.relPath} class="search-file-group">
          <header class="search-file-head">
            <span class="search-file-path">{file.relPath}</span>
            <span class="search-file-count">
              {file.total}{file.truncated ? '+' : ''} hits
            </span>
          </header>
          <ul>
            {file.hits.map((hit) => {
              const idx = cursor++;
              const isActive = idx === activeIndex;
              return (
                <li
                  key={`${file.relPath}:${hit.line}:${hit.col}`}
                  class={`search-hit-row${isActive ? ' is-active' : ''}`}
                  onMouseEnter={() => onHover(idx)}
                  onClick={() => onPick(idx)}
                >
                  <span class="search-hit-line">L{hit.line}</span>
                  <span class="search-hit-snippet">
                    {renderSnippet(hit.snippet, hit.highlight)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {state.truncated && (
        <div class="search-empty">More results truncated — refine your query.</div>
      )}
    </div>
  );
}

function renderSnippet(snippet: string, highlight: [number, number]) {
  const [a, b] = highlight;
  return (
    <>
      <span>{snippet.slice(0, a)}</span>
      <mark class="search-hit">{snippet.slice(a, b)}</mark>
      <span>{snippet.slice(b)}</span>
    </>
  );
}
