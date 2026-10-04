# Features

Comprehensive catalog of what `mdview` does today (post Phase 2, May 2026).

## Layout & navigation

| Feature | Implementation |
|---------|----------------|
| 3-pane shell (file tree / content / outline) | CSS grid in `layout.css` |
| Collapsible sidebars with thin label rails when collapsed | `useUiState`, persisted in `localStorage` (`mdview-tree-collapsed`, `mdview-outline-collapsed`); collapse buttons live inside each pane (no duplicate header toggles) |
| **Resizable sidebars** with drag handles | `Resizer.tsx` — pointer-driven, pointer-capture, persisted widths (`mdview-tree-width`, `mdview-outline-width`); collapses below threshold |
| **Wide layout toggle** — relaxes the reading-column cap (70ch → 100ch) | `useUiState` (`mdview-wide-layout`), `data-wide` attribute, View menu toggle, `w` shortcut |
| Folder tree with folder/file icons, expand/collapse; fixed per-level indent (`--tree-indent`) and horizontal scroll for long names | `FolderTree.tsx`, `.tree-scroll` in `components.css` |
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
| **Collapsible sections** — every heading folds its trailing content | `lib/collapsible-sections.ts` wire. For each top-level heading in `.markdown-content`, a chevron `<button class="section-toggle">` is prepended; clicking it toggles `hidden` on every trailing sibling up to the next heading of equal-or-shallower level. State is per-tab, kept in a module-scoped `Set<string>`; survives same-file live-reload, resets on path change via `currentPathSignal`. `expandSectionContaining(id)` is called from `App.tsx` `handleJump` / `handleInternalNav` / hash-restore so anchor links land in visible targets. `beforeprint` snapshots & expands; `afterprint` restores. Keyboard: `e` / `⇧E` (`expandAll` / `collapseAll`). |

## Rendering

| Feature | Implementation |
|---------|----------------|
| CommonMark + GFM (tables, task lists, strikethrough, autolinks) | `markdown-it` with linkify enabled |
| **Server-side syntax highlighting (Shiki, palette-aware)** | `render/shiki.ts` — renders the active palette's light and dark variants per token as inline CSS variables; CSS picks one via `[data-theme]`. Zero client highlighter bundle. Light/dark repaints in CSS; a palette change refetches. |
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
| **Palette picker — flexoki / paper / solarized / everforest / rose-pine / kanagawa / catppuccin / high-contrast** | `ViewMenu.tsx` in header (consolidated gear menu); `usePalette.ts` resolves user override > project config > default (`flexoki`); `data-palette` attribute on `<html>` |
| **Per-palette ground texture** | `theme.css` — each palette sets `--paper-grain` to one of three patterns: dot grain (flexoki/paper/solarized), fibre noise (everforest/kanagawa, an SVG `feTurbulence` data URI), accent wash (rose-pine/catppuccin). `high-contrast` sets `none`. |
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
| **`e` / `⇧E`** | Expand all / collapse all sections |
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

## CLI

| Command | Behavior |
|---|---|
| `mdview [path]` | Add the file or folder to the shared background server, open it, and return the shell. Starts the server if it isn't running. Defaults to the current directory. |
| `mdview ls` (or `status`) | The open folders, which the server has actually loaded, its port and pid, and the log path. |
| `mdview rm <name\|path>…` | Stop serving a folder. Open tabs update themselves. |
| `mdview stop` | Stop the background server. Folders stay in the workspace. |
| `mdview config <…>` | Read or edit the global config. |

| Flag | Behavior |
|---|---|
| `--foreground`, `-f` | Run a server in this terminal serving just this folder, stopped with Ctrl-C. No daemon, no state files, no `/api/health`. |
| `--port <n>` | Bind a specific port; implies `--foreground`. Default 7331, which auto-falls-back through 10 consecutive ports; an explicit `--port` does not fall back and fails loudly instead. `--port 0` takes a kernel-assigned port. |
| `--no-open` | Don't launch a browser. |
| `--palette <name>` | `classic` / `paper` / `nord` / `solarized` / `high-contrast`; implies `--foreground`. Applied at API-response time, so it overrides `.mdview.json` and the global config without modifying either on disk. |
| `--vscode` | Sidecar mode for the VS Code extension: implies `--no-open`, emits one JSON ready line (`{"event":"ready","url":…,"port":…}`) instead of human output, drops `frame-ancestors` so a webview can frame the SPA, and shuts down when stdin closes. |
| `--help` / `--version` | Usage and version. |

The URL printed and opened is `http://mdview.localhost:7331/`. `*.localhost` is reserved to loopback by RFC 6761 and resolves with no setup and no `/etc/hosts` entry; the server still binds `127.0.0.1` only. If the local resolver doesn't answer the name with a loopback address, the CLI falls back to `http://127.0.0.1:<port>/` rather than printing a URL that might leave the machine.

`PORT` sets the default port when `--port` is omitted, so mdview runs unchanged under a local reverse proxy such as [portless](https://github.com/vercel-labs/portless) — which gives it a port-free `https://mdview.localhost` of its own. Invalid values are ignored rather than fatal.

`MDVIEW_IDLE_TIMEOUT` makes the background server exit after that many minutes
with no connected tab. Off by default — it runs until `mdview stop`.

`--port` and `--palette` imply `--foreground` because each overrides a setting
that belongs to a whole server, and the background one is shared. A side effect
worth knowing: every pre-daemon invocation therefore behaves exactly as it used
to, and only the bare `mdview [path]` form changed.

## Workspaces

- **One background server for everything.** The first `mdview <path>` starts it detached; every later one adds its folder to the same server. One port, one URL, one process, however many repos.
- **Folders are unrelated.** They don't have to be siblings, or share a parent, or be in the same tree at all. Each keeps its own `.mdview.json` `ignore` list and its own file watcher.
- **The sidebar groups them.** One folder's contents sit at the top level exactly as before; two or more get a heading each. `⌘P` and folder-wide search span all of them.
- **Persistent.** Folders stay open across restarts and reboots until `mdview rm`. Capped at 8, since each holds a live recursive watcher.
- **Reuse over duplication.** Opening a file or subfolder inside an already-open folder reuses it and jumps to the file, instead of adding an overlapping root.
- **Runs until stopped.** `mdview stop` ends it; otherwise it stays put, which keeps the URL reliable. `MDVIEW_IDLE_TIMEOUT` opts into exiting after N minutes with no tab connected, for anyone who'd rather it didn't sit there holding watchers.
- **State** lives only in `~/.config/mdview/` — `daemon.json` (pid, port, start time), `workspace.json` (the open folders), `daemon.log` (truncated past 1 MB).
- **The workspace file is the control plane.** The CLI writes it; the server watches it. There is deliberately no HTTP endpoint that changes what is served, so there is no request a page in your browser could forge — see Security & boundaries.

Subcommand: `mdview config path`, `mdview config ignore list|add|rm` — see
Themes & palettes.

Errors are mapped to a one-line `mdview: …` message with a non-zero exit;
`MDVIEW_DEBUG=1` prints the full stack instead.

## Security & boundaries

- All filesystem reads go through `resolveSafePath` (rejects absolute paths and traversal).
- Server binds to `127.0.0.1` only.
- Every request's `Host` must be a loopback name (`isAllowedHost`) or it is refused with a bare 403 — the DNS-rebinding guard.
- No HTTP endpoint can change which folders are served. The CLI edits `workspace.json` and the server watches it, so adding a root needs filesystem access, which a web page does not have. Nothing to CSRF, and no shared token to store or leak.
- `/api/health` reports only ids, a pid and a start time — never absolute paths. `mdview ls` reads paths from the local workspace file instead.
- Stopping the server checks both the recorded pid **and** its start time against what the process reports before signalling it, so a recycled pid belonging to something else is never killed.
- State files are written `0600` inside a `0700` directory, each via a temp file and one rename so a reader never sees a half-written file.
- External links always use `rel="noopener noreferrer"`.
- `innerHTML` only used to inject server-rendered (trusted) HTML.
- `.mdview.json` parser validates types and rejects unsafe `lineWidth` strings before they hit CSS.

## Build artifacts

- Server CLI bundle: `bin/mdview.mjs` (~26 KB minified). KaTeX is **not** bundled into the CLI — only into the lazy-loaded client chunk.
- Client SPA bundle: `dist/client/` (initial JS small; mermaid + KaTeX + Shiki language packs split into separate lazy chunks; JetBrains Mono served via `@fontsource` with `unicode-range` so only the needed subset is fetched).
