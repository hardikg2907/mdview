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

  const stats = useMemo(() => computeDocStats(file.html, file.outline), [file]);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = file.html;
    void runWires(ref.current, { onInternalNavigate }, defaultWires);
  }, [file]);

  // Apply focus mode on toggle and on focused-heading change. `focusedHeadingId`
  // tracks the top-third reading band (not the viewport top), so the bright
  // section is always the one under the reader's eyes — rolls forward to the
  // next section as soon as its title enters the natural reading zone, instead
  // of clinging to a heading that scrolled off-screen pages ago.
  useEffect(() => {
    if (!ref.current) return;
    if (focusModeSignal.value) {
      applyFocus(ref.current, focusedHeadingId.value);
    } else {
      clearFocus(ref.current);
    }
  }, [focusModeSignal.value, focusedHeadingId.value, file]);

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
