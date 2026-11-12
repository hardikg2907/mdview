import { effect } from '@preact/signals';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { formatAbsoluteTime, formatRelativeTime } from '../../shared/relative-time.js';
import type { RenderedFile } from '../../shared/types.js';
import { focusedHeadingId } from '../hooks/useScrollSpy.js';
import { focusModeSignal } from '../hooks/useUiState.js';
import { computeDocStats, formatStats } from '../lib/doc-stats.js';
import { applyFocus, clearFocus } from '../lib/focus-mode.js';
import { runWires } from '../lib/wire-pipeline.js';
import { defaultWires } from '../lib/wires.js';

interface Props {
  file: RenderedFile;
  onInternalNavigate: (relPath: string, hash: string) => void;
}

export function Content({ file, onInternalNavigate }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const navRef = useRef(onInternalNavigate);
  navRef.current = onInternalNavigate;

  const stats = useMemo(() => computeDocStats(file.html, file.outline), [file]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ctl = new AbortController();
    el.innerHTML = file.html;
    void runWires(
      el,
      { onInternalNavigate: (rel, hash) => navRef.current(rel, hash), signal: ctl.signal },
      defaultWires,
    );
    return () => ctl.abort();
  }, [file]);

  // Apply focus mode via a direct signal effect rather than reading signals in
  // render: scrolling across headings never re-renders `<Content>`, and when
  // focus mode is off `focusedHeadingId` isn't even subscribed.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return effect(() => {
      if (focusModeSignal.value) {
        applyFocus(el, focusedHeadingId.value);
      } else {
        clearFocus(el);
      }
    });
  }, [file]);

  return (
    <article class="markdown-body">
      {file.frontmatter && Object.keys(file.frontmatter).length > 0 && (
        <details class="frontmatter-block">
          <summary>frontmatter</summary>
          <pre><code>{JSON.stringify(file.frontmatter, null, 2)}</code></pre>
        </details>
      )}
      {stats.words > 0 && (
        <div class="doc-stats" aria-label="Document statistics">
          <span>{formatStats(stats)}</span>
          {file.lastModified > 0 && (
            <>
              <span class="doc-stats-sep" aria-hidden>·</span>
              <span
                class="doc-stats-updated"
                title={formatAbsoluteTime(file.lastModified)}
              >
                Updated {formatRelativeTime(file.lastModified)}
              </span>
            </>
          )}
        </div>
      )}
      <div ref={ref} class="markdown-content" />
    </article>
  );
}
