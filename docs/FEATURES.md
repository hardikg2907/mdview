# Features

Comprehensive catalog of what `mdview` does today (v1, May 2026).

## Layout & navigation

| Feature | Implementation |
|---------|----------------|
| 3-pane shell (file tree / content / outline) | CSS grid in `layout.css` |
| Collapsible sidebars with thin label rails when collapsed | `useUiState`, persisted in `localStorage` (`mdview-tree-collapsed`, `mdview-outline-collapsed`) |
| Folder tree with folder/file icons, expand/collapse | `FolderTree.tsx` |
| Outline sidebar with depth indentation, scroll-spy, per-node fold | `Outline.tsx`, `useScrollSpy.ts` |
| Breadcrumbs reflecting current heading; clickable segments | `Breadcrumbs.tsx` |
| Cross-file `[link](other.md)` navigation inside the SPA | `tagInternalLinks` server-side + `wireInternalLinks` client-side |
| Per-heading anchor URLs (refresh keeps your spot) | `markdown-it-anchor` + hash-restore in `App.tsx` |
| Quick file switcher (`⌘P`) with fuzzy search | `CommandPalette.tsx` + `lib/file-search.ts` |
| Reading-progress bar at bottom of header | `ReadingProgress.tsx` |
| Doc stats strip below H1 (reading time / words / headings) | `lib/doc-stats.ts` |

## Rendering

| Feature | Implementation |
|---------|----------------|
| CommonMark + GFM (tables, task lists, strikethrough, autolinks) | `markdown-it` with linkify enabled |
| Server-side syntax highlighting (Shiki, dual-theme) | `shiki.ts` — zero client highlighter bundle |
| Mermaid diagrams (lazy-loaded) | server emits `<div class="mermaid-block">`; `lib/mermaid-loader.ts` does dynamic `import('mermaid')` only when present |
| Front matter (YAML) parsing & display | `frontmatter.ts` + `<details>` block in `Content.tsx` |
| Inline HTML pass-through | markdown-it `html: true` |
| Images with relative-path resolution | `rewriteImageSrc` rewrites to `/__asset/<resolved>`; `api-asset.ts` serves with mime detection |
| Image lightbox on click | `lib/image-lightbox.ts` + `Lightbox.tsx` |
| External links → `↗` icon + `target="_blank"` + `rel="noopener noreferrer"` | `lib/external-links.ts` |
| Code copy buttons (hover-revealed, "Copied" flash) | `lib/copy-buttons.ts` |
| Heading permalinks (hover `#` to copy URL) | `lib/permalinks.ts` |
| Custom-styled task list checkboxes | `content.css` — accent fill when checked |
| Editorial typography (serif body, italic accent H1, paper-grain) | `theme.css` + `content.css` |

## Search

| Feature | Implementation |
|---------|----------------|
| In-doc search with match highlighting | `SearchBar.tsx` + `lib/search.ts` |
| Match counter ("3 / 12") | live-read from DOM (`mark.search-hit` count) for state-sync robustness |
| Prev / next navigation (Enter / Shift-Enter / arrows / buttons) | `SearchBar.tsx` |
| Search scoped to `.markdown-content` only | filter excludes search-bar UI, doc-stats, frontmatter, injected widgets |

## Live reload

| Feature | Implementation |
|---------|----------------|
| File-system watch via chokidar | `src/server/watcher.ts` |
| Server-Sent Events stream | `src/server/routes/sse.ts` |
| Client SSE subscription | `src/client/hooks/useSSE.ts` |
| Re-render preserves scroll position | `App.tsx` — `mainRef.current.scrollTop` snapshot/restore |
| Tree refresh on `add`/`unlink` events | `App.tsx` |

## Themes

| Feature | Implementation |
|---------|----------------|
| Light + dark themes | CSS variables in `theme.css`, swapped via `data-theme` on `<html>` |
| OS preference detection | `useTheme.ts` matchMedia subscription |
| Manual override (persisted) | `themeSignal` + `localStorage` key `mdview-theme` |
| Shiki dual-theme color swap (no re-render needed) | Shiki emits `--shiki-light` / `--shiki-dark` CSS vars |

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘P` / `Ctrl+P` | Quick file switcher |
| `⌘F` / `Ctrl+F` or `/` | Open in-doc search |
| `⌘B` / `Ctrl+B` | Toggle file tree |
| `⌘.` / `Ctrl+.` | Toggle outline |
| `⌘\` / `Ctrl+\` | Toggle theme |
| `j` / `k` | Next / previous heading |
| `Enter` / `Shift+Enter` | Next / previous match in search |
| `Esc` | Close search / lightbox / panel |
| `?` | Open shortcuts panel |

Implementation: `src/client/hooks/useKeyboardShortcuts.ts` (single global listener) + `src/client/components/ShortcutsPanel.tsx` (help modal).

## Polish

- Loading skeleton during first file load (`ContentSkeleton.tsx`).
- Smooth transitions on theme swap, sidebar collapse, outline highlight.
- Backdrop-blur overlays on lightbox / shortcuts panel / command palette.
- Subtle paper-grain background texture (radial-dot pattern at 4–5% alpha).

## Security & boundaries

- All filesystem reads go through `resolveSafePath` (rejects absolute paths and traversal).
- Server binds to `127.0.0.1` only.
- External links always use `rel="noopener noreferrer"`.
- `innerHTML` only used to inject server-rendered (trusted) HTML.

## Build artifacts

- Server CLI bundle: `bin/mdview.mjs` (~15 KB).
- Client SPA bundle: `dist/client/` (~30 KB initial JS, ~3 MB total with lazy-loaded mermaid + transitive deps).
