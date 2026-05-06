import { useEffect, useMemo, useRef } from 'preact/hooks';
import type { RenderedFile } from '../../shared/types.js';
import { renderMermaidIn } from '../lib/mermaid-loader.js';
import { wireInternalLinks } from '../lib/link-router.js';
import { wireCopyButtons } from '../lib/copy-buttons.js';
import { wirePermalinks } from '../lib/permalinks.js';
import { markExternalLinks } from '../lib/external-links.js';
import { wireImageLightbox } from '../lib/image-lightbox.js';
import { computeDocStats, formatStats } from '../lib/doc-stats.js';

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
    void renderMermaidIn(ref.current);
    wireInternalLinks(ref.current, onInternalNavigate);
    wireCopyButtons(ref.current);
    wirePermalinks(ref.current);
    markExternalLinks(ref.current);
    wireImageLightbox(ref.current);
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
          {formatStats(stats)}
        </div>
      )}
      <div ref={ref} class="markdown-content" />
    </article>
  );
}
