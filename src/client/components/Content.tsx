import { useEffect, useMemo, useRef } from 'preact/hooks';
import type { RenderedFile } from '../../shared/types.js';
import { runWires } from '../lib/wire-pipeline.js';
import { defaultWires } from '../lib/wires.js';
import { computeDocStats, formatStats } from '../lib/doc-stats.js';
import { formatRelativeTime, formatAbsoluteTime } from '../../shared/relative-time.js';
import { applyFocus, clearFocus } from '../lib/focus-mode.js';
import { focusModeSignal } from '../hooks/useUiState.js';
import { activeHeadingId } from '../hooks/useScrollSpy.js';

interface Props {
  file: RenderedFile;
  onInternalNavigate: (relPath: string, hash: string) => void;
}

export function Content({ file, onInternalNavigate }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  const stats = useMemo(() => computeDocStats(file.html, file.outline), [file]);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = file.html;
    void runWires(ref.current, { onInternalNavigate }, defaultWires);
  }, [file]);

  // Apply focus mode on toggle and on active heading change.
  useEffect(() => {
    if (!ref.current) return;
    if (focusModeSignal.value) {
      applyFocus(ref.current, activeHeadingId.value);
    } else {
      clearFocus(ref.current);
    }
  }, [focusModeSignal.value, activeHeadingId.value, file]);

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
