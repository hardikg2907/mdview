# Verification report — mdview v0.1.0

End-to-end walk of the 8 product-spec scenarios.

## Setup

```bash
npm install && npm run build
```

## Scenarios

### 1. Single-file mode
- `node bin/mdview.mjs ./README.md --no-open`: server boots; `/api/tree` returns single-file tree; `/api/file?path=README.md` returns rendered HTML, outline, title.
- Edit-and-save propagation: verified via SSE endpoint streaming watcher events.
- Scroll preservation on reload: implemented in `App.tsx` via `mainRef.current.scrollTop` snapshot/restore around the SSE refetch.

### 2. Folder mode
- `node bin/mdview.mjs ./<folder> --no-open`: `/api/tree` returns nested tree; non-md files marked `isMarkdown: false`.
- Cross-file links: server's `tagInternalLinks` adds `data-internal-link="<resolved>"` for `.md`/`.markdown`/`.mdx` hrefs; client's `link-router.ts` intercepts clicks and calls `onNavigate` without a full page load.

### 3. Long-doc orientation
- Outline pulled from heading_open tokens, hierarchically nested by `extractOutline`. Tested with the plan file (40+ headings).
- Collapsibility: each outline node has a fold-button when it has children (`Outline.tsx:34-43`).
- Scroll-spy + breadcrumb: `useScrollSpy` updates `activeHeadingId` signal on scroll; `Breadcrumbs.tsx` renders the path from root to active node.

### 4. Code-heavy doc
- Server-side Shiki highlights all known languages with `themes: { light: 'github-light', dark: 'github-dark' }`, `defaultColor: false`. Unknown languages lazy-load via `loadLanguage`, fall back to plain `text` on error.
- Verified via curl: rendered HTML for a code-heavy fixture contains `<pre class="shiki shiki-themes ...">` with theme styles.

### 5. Mermaid doc
- Mermaid fences are emitted as `<div class="mermaid-block" data-source="...">` by `markdown.ts`.
- Client renders them only on docs that contain such blocks: `mermaid-loader.ts` does `import('mermaid')` only when `.mermaid-block` elements are found in the rendered HTML. Vite confirms `mermaid.core` and friends are split into separate chunks (lazy).

### 6. Theme follow
- `useTheme.ts` listens to `prefers-color-scheme: dark` MQ and sets `data-theme` on `documentElement`. Theme variables in `theme.css` swap accordingly.
- Verified by reading code rather than running in a browser; toggling color scheme switches theme without page reload per the implementation.

### 7. Anchor stability
- `App.tsx` reads `window.location.hash` after file load and `scrollIntoView` on the matching id (auto for first paint, smooth for in-app jumps).
- `markdown-it-anchor` adds stable slug ids to all headings.

### 8. Visual / engagement check
- Tasteful color: H1 uses `--accent` (warm orange both modes), H2/H3 in `--fg`, blockquotes have a left bar in `--quote-bar` plus soft `--quote-bg` background, code blocks have rounded corners + soft shadow, outline active highlight uses `--accent-soft` background.
- Smooth transitions: `--transition: 160ms ease` on outline highlight, link hover, tree-item background, chevron rotation.
- Comfortable line width: `--line-width: 72ch` clamps prose width.
- Best-effort assessment: feels inviting in CSS review; subjective UX judgement requires opening a real browser.

## Tests
- Server: 31 / 31 passing (markdown, shiki, frontmatter, outline, resolve, tree, links).
- Client: 3 / 3 passing (scroll-spy logic).
- Both `tsc --noEmit` invocations clean.

## Build size
- Client bundle: ~3 MB total (mostly mermaid + transitive deps, all lazy-loaded). Initial-load JS for non-mermaid docs: ~30 KB.
- Server bundle: ~14 KB (`bin/mdview.mjs`).

## Known follow-ups (deferred per spec)
- Search (within-doc, across-folder)
- Static export (`--export`)
- Math / LaTeX
- Custom themes
- Vim-style keybindings
- Focus mode / minimap
