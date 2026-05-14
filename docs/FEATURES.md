# Features

Comprehensive catalog of what `mdview` does today (post Phase 2, May 2026).

## Layout & navigation

| Feature | Implementation |
|---------|----------------|
| 3-pane shell (file tree / content / outline) | CSS grid in `layout.css` |
| Collapsible sidebars with thin label rails when collapsed | `useUiState`, persisted in `localStorage` (`mdview-tree-collapsed`, `mdview-outline-collapsed`); collapse buttons live inside each pane (no duplicate header toggles) |
| **Resizable sidebars** with drag handles | `Resizer.tsx` — pointer-driven, pointer-capture, persisted widths (`mdview-tree-width`, `mdview-outline-width`); collapses below threshold |
| **Wide layout toggle** — relaxes the reading-column cap (70ch → 100ch) | `useUiState` (`mdview-wide-layout`), `data-wide` attribute, View menu toggle, `w` shortcut |
| Folder tree with folder/file icons, expand/collapse | `FolderTree.tsx` |
| Outline sidebar with depth indentation, scroll-spy, per-node fold | `Outline.tsx`, `useScrollSpy.ts` |
| **Outline level filter (2-thumb range slider)** | `Outline.tsx` head + `useOutlineLevels.ts` + `lib/outline-filter.ts`; min/max persisted via `mdview-outline-min-level` + `mdview-outline-max-level`; visible set derived as `{min..max}` via a computed signal |
| Breadcrumbs reflecting current heading; clickable segments | `Breadcrumbs.tsx` |
| Cross-file `[link](other.md)` navigation inside the SPA | `tagInternalLinks` server-side + `wireInternalLinks` client-side |
| Per-heading anchor URLs (refresh keeps your spot) | `markdown-it-anchor` + hash-restore in `App.tsx` |
| Quick file switcher (`⌘P`) with fuzzy search | `CommandPalette.tsx` + `lib/file-search.ts` |
| Reading-progress bar at bottom of header | `ReadingProgress.tsx` |
| Doc stats strip below H1 (reading time / words / headings) | `lib/doc-stats.ts` |
| **Last-updated timestamp on the doc** ("Updated N ago" + absolute tooltip) | `RenderedFile.lastModified` (server stat) + `shared/relative-time.ts` |

## Reading modes

| Feature | Implementation |
|---------|----------------|
| **Focus mode — dims everything except the section under your eyes** | `lib/focus-mode.ts` (`applyFocus` / `clearFocus`) driven by `focusedHeadingId` from `useScrollSpy`. Distinct from `activeHeadingId` (used by breadcrumb/outline/minimap): focus uses a **top-third reading band** (`FOCUS_BAND_FRACTION = 0.35`) so the highlight rolls forward to a new section the moment its title enters the natural reading zone, instead of clinging to a heading that scrolled off-screen pages ago. Navigation indicators still answer "where am I in the doc?" (top edge); focus answers "what am I reading right now?" (reading zone). Toggled by `f` or the View menu. |
| **Minimap rail with viewport indicator** | `Minimap.tsx`; bars per heading, click/drag to scroll; toggled by `m` or header button |

## Rendering

| Feature | Implementation |
|---------|----------------|
| CommonMark + GFM (tables, task lists, strikethrough, autolinks) | `markdown-it` with linkify enabled |
| **Server-side syntax highlighting (Shiki, palette-aware)** | `render/shiki.ts` — renders 10 theme variants per token (5 palettes × light/dark) inline as CSS variables; CSS picks the active variant via `[data-palette][data-theme]`. Zero client highlighter bundle. No re-render on palette swap. |
| Mermaid diagrams (lazy-loaded) | server emits `<div class="mermaid-block">`; `lib/mermaid-loader.ts` does dynamic `import('mermaid')` only when present |
| **Math / LaTeX (KaTeX, lazy-loaded)** | custom `markdown-it` core rule in `render/math.ts` emits `<span class="math-inline">` and `<div class="math-block">`; `lib/katex-loader.ts` dynamic-imports KaTeX + injects its CSS only when math is present |
| Front matter (YAML) parsing & display | `render/frontmatter.ts` + `<details>` block in `Content.tsx` |
| Inline HTML pass-through | markdown-it `html: true` |
| Images with relative-path resolution | `rewriteImageSrc` rewrites to `/__asset/<resolved>`; `api-asset.ts` serves with mime detection |
| Image lightbox on click | `lib/image-lightbox.ts` + `Lightbox.tsx` |
| External links → `↗` icon + `target="_blank"` + `rel="noopener noreferrer"` | `lib/external-links.ts` |
| Code copy buttons (hover-revealed, "Copied" flash) | `lib/copy-buttons.ts` |
| Heading permalinks (hover `#` to copy URL) | `lib/permalinks.ts` |
| Custom-styled task list checkboxes | `content.css` — accent fill when checked |
| Editorial typography (serif body, italic accent H1, paper-grain) | `theme.css` + `content.css` |
| **JetBrains Mono in code blocks** | `@fontsource/jetbrains-mono` (latin/cyrillic/greek subsets, weights 400/600), bundled via Vite, listed first in `--font-mono` |

## Search

| Feature | Implementation |
|---------|----------------|
| In-doc search with match highlighting | `SearchBar.tsx` + `lib/search.ts` |
| **Folder-wide search** | `GET /api/search` → `server/fs/grep.ts`; client `lib/folder-search.ts` + `SearchBar` `Folder` scope; results grouped by file with snippets |
| **Search options: case-sensitive, whole-word, regex** | shared regex compiler in `shared/search-pattern.ts` (used by both doc and folder search); UI pills `Aa`/`ab`/`.*` on the search bar |
| Match counter ("3 / 12") | live-read from DOM (`mark.search-hit` count) for state-sync robustness |
| Prev / next navigation (Enter / Shift-Enter / arrows / buttons) | `SearchBar.tsx` |
| Search scoped to `.markdown-content` only | filter excludes search-bar UI, doc-stats, frontmatter, injected widgets |
| Tab cycles Doc ↔ Folder scope | `SearchBar.tsx` |

## Live reload

| Feature | Implementation |
|---------|----------------|
| File-system watch via chokidar | `src/server/watcher.ts` |
| **`.mdview.json` watch** (separate from main watcher; main watcher ignores dotfiles) | `src/server/index.ts` boot |
| Server-Sent Events stream | `src/server/routes/sse.ts` |
| Client SSE subscription | `src/client/hooks/useSSE.ts` |
| Re-render preserves scroll position | `useLiveReload.ts` — `mainRef.current.scrollTop` snapshot/restore |
| Tree refresh on `add`/`unlink`/`config` events | `useLiveReload.ts` calls `fetchTree()` |

## Themes & palettes

| Feature | Implementation |
|---------|----------------|
| Light + dark themes | CSS variables in `theme.css`, swapped via `data-theme` on `<html>` |
| OS preference detection | `useTheme.ts` matchMedia subscription |
| Manual override (persisted) | `themeSignal` + `localStorage` key `mdview-theme` |
| **Palette picker — classic / paper / nord / solarized / high-contrast** | `ViewMenu.tsx` in header (consolidated gear menu); `usePalette.ts` resolves user override > project config > default; `data-palette` attribute on `<html>` |
| **High-contrast palette** | `data-palette="high-contrast"` — near-pure-white / near-pure-black prose, bolder accents, stronger borders; pairs with `github-light-high-contrast` / `github-dark-high-contrast` Shiki themes |
| **Per-project config (`.mdview.json`)** | `src/server/config.ts` validates & loads; included in `/api/tree` response; live-reloaded |
| **Global config (`~/.config/mdview/config.json`)** | `loadGlobalConfig` honours `$XDG_CONFIG_HOME`; merged with per-project via `mergeConfigs` (project wins for scalars; `ignore` is unioned) |
| **`ignore` field — extends built-in skip list of heavy build/dep dirs** | `src/server/fs/ignore.ts` defines `DEFAULT_IGNORED_DIRS` + `isPathIgnored`; consumed by both `walkFolder` and `createWatcher` to prevent `EMFILE`/`ENOSPC` at repo roots; tooltip in tree pane (`FolderTree.tsx`) lists defaults + points at the global config |
| Synchronous theme/palette/wide-layout bootstrap (no FOUC on reload) | External script `src/client/public/bootstrap.js` referenced from `<head>` of `index.html`; reads `mdview-theme` / `mdview-palette` / `mdview-wide-layout` from `localStorage`, validates against allow-list, and sets `data-theme` / `data-palette` / `data-wide` before first paint. Must stay external — the strict `script-src 'self'` CSP blocks inline scripts (and adding `'unsafe-inline'` or relaxing the policy is explicitly forbidden by CLAUDE.md §3.1) |

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘P` / `Ctrl+P` | Quick file switcher |
| `⌘F` / `Ctrl+F` or `/` | Open in-doc search |
| **`⇧⌘F` / `Ctrl+Shift+F`** | Open folder-wide search |
| `⌘B` / `Ctrl+B` | Toggle file tree |
| `⌘.` / `Ctrl+.` | Toggle outline |
| `⌘\` / `Ctrl+\` | Toggle theme |
| `j` / `k` | Next / previous heading |
| **`gg` / `⇧G`** | Top / bottom of document |
| **`[` / `]`** | Previous / next heading at the same level |
| **`⇧H` / `⇧L`** | Previous / next file in folder |
| **`Ctrl+D` / `Ctrl+U`** | Half-page down / up |
| **`Alt`/`⌥` + scroll** | Fast scroll (~4×) in the main pane (`useAltWheelScroll.ts`) |
| **`f` / `m` / `w`** | Toggle focus mode / minimap / wide layout |
| `Enter` / `Shift+Enter` | Next / previous match in search |
| `Esc` | Close search / lightbox / panel |
| `?` | Open shortcuts panel |

Implementation: shortcuts live in a single registry at `src/client/shortcuts.ts`. The dispatcher (`useKeyboardShortcuts.ts`) walks the registry per keydown; `ShortcutsPanel.tsx` renders the same registry grouped by `group` field. Adding a shortcut is one entry, in one file.

## Polish

- Loading skeleton during first file load (`ContentSkeleton.tsx`).
- Smooth transitions on theme swap, sidebar collapse, outline highlight.
- Backdrop-blur overlays on lightbox / shortcuts panel / command palette.
- Subtle paper-grain background texture (radial-dot pattern at 4–5% alpha).
- **Custom subtle tooltips** on header controls + outline pills + search options (CSS-only via `[data-tooltip]` attribute; `aria-label` retained for accessibility).
- **Graceful shutdown** with explicit port-conflict messages and `MDVIEW_DEBUG=1` for full stack traces.

## Security & boundaries

- All filesystem reads go through `resolveSafePath` (rejects absolute paths and traversal).
- Server binds to `127.0.0.1` only.
- External links always use `rel="noopener noreferrer"`.
- `innerHTML` only used to inject server-rendered (trusted) HTML.
- `.mdview.json` parser validates types and rejects unsafe `lineWidth` strings before they hit CSS.

## Build artifacts

- Server CLI bundle: `bin/mdview.mjs` (~26 KB minified). KaTeX is **not** bundled into the CLI — only into the lazy-loaded client chunk.
- Client SPA bundle: `dist/client/` (initial JS small; mermaid + KaTeX + Shiki language packs split into separate lazy chunks; JetBrains Mono served via `@fontsource` with `unicode-range` so only the needed subset is fetched).
