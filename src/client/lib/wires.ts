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
  // Synchronous wires run first so collapsed state, link routing, copy buttons,
  // permalinks, and image lightbox are interactive immediately — before any
  // lazy async chunk import (pele / katex) suspends the pipeline.
  wireCollapsibleSections,
  { name: 'internal-links', run: (root, ctx) => wireInternalLinks(root, ctx.onInternalNavigate) },
  { name: 'external-links', run: (root) => markExternalLinks(root) },
  { name: 'copy-buttons', run: (root) => wireCopyButtons(root) },
  { name: 'permalinks', run: (root) => wirePermalinks(root) },
  { name: 'image-lightbox', run: (root) => wireImageLightbox(root) },
  { name: 'mermaid', run: (root, ctx) => renderMermaidIn(root, ctx.signal) },
  { name: 'math', run: (root, ctx) => renderMathIn(root, ctx.signal) },
];
