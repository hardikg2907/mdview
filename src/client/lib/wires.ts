import { wireCollapsibleSections } from './collapsible-sections.js';
import { wireCopyButtons } from './copy-buttons.js';
import { markExternalLinks } from './external-links.js';
import { wireImageLightbox } from './image-lightbox.js';
import { renderMathIn } from './katex-loader.js';
import { wireInternalLinks } from './link-router.js';
import { renderMermaidIn } from './mermaid-loader.js';
import { wirePermalinks } from './permalinks.js';
import type { Wire } from './wire-pipeline.js';

export const defaultWires: Wire[] = [
  // First so the synchronous body sets `activeRoot` and restores collapsed
  // state before any async wire (mermaid / math import) suspends the pipeline
  // — `App.tsx` schedules a rAF for hash-restore expansion that would
  // otherwise fire while the collapsible-sections wire is still queued.
  wireCollapsibleSections,
  { name: 'mermaid', run: (root) => renderMermaidIn(root) },
  { name: 'math', run: (root) => renderMathIn(root) },
  { name: 'internal-links', run: (root, ctx) => wireInternalLinks(root, ctx.onInternalNavigate) },
  { name: 'copy-buttons', run: (root) => wireCopyButtons(root) },
  { name: 'permalinks', run: (root) => wirePermalinks(root) },
  { name: 'external-links', run: (root) => markExternalLinks(root) },
  { name: 'image-lightbox', run: (root) => wireImageLightbox(root) },
];
