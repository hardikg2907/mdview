# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- **Inline `<code>` inside table cells now wraps on overflow** instead of forcing the column to demand huge minimum width. Previously, a cell containing a long unbroken identifier (e.g. `debezium.source.column.exclude.list=public.data_processors.completion_pct,…`) would dominate the table layout and starve sibling columns, causing short labels like `houston-debezium-server` to wrap into three lines. Scoped to `td code` / `th code` so prose-with-inline-code elsewhere is unaffected.
- **Copy button stays put while a code block is scrolled horizontally.** Previously the button was an absolutely-positioned child of `<pre>` (the scroll container), so it drifted off-screen with the content. The button now lives on a `position: relative` wrapper sibling of `<pre>`, so the wrapper holds its position while only the code scrolls underneath.

## [0.6.0] — 2026-05-14

### Added
- **Collapsible sections.** Every heading gets a small chevron (hover-revealed when expanded, always visible when collapsed) that folds the section — every trailing sibling up to the next heading of equal-or-shallower level. State is per-tab, survives live-reload of the same file, resets on file switch. Anchor jumps (TOC, internal links, hash restore) auto-expand the target's containing section. In-doc search progressively expands collapsed sections as you cycle into matches that live inside them. Print expands everything and re-collapses after. Keyboard: `e` expand all, `⇧E` collapse all.

## [0.5.0] — 2026-05-14

### Fixed
- **No more `EMFILE: too many open files` crash on a repo root.** The file watcher used to descend into anything that wasn't a dotfile or `node_modules`, which on a polyglot monorepo (Elixir `_build/`, Rust `target/`, Python `__pycache__/venv/`, Go `vendor/`, generic `dist/build/out/coverage/`) blows past macOS's 256 soft FD limit (kqueue) and Linux's `inotify.max_user_watches`. Built-in skip list expanded to cover those names at every depth.

### Added
- **`ignore: ["my-dir", "_site"]`** field in `.mdview.json` (project) or `~/.config/mdview/config.json` (new global config) extends the built-in skip list with your own basenames. Strings only, no globs — the comparison is plain basename equality. Restart mdview after editing; the watcher freezes its ignore set at startup.
- **Global config at `~/.config/mdview/config.json`** (honours `XDG_CONFIG_HOME` if set). Same schema as the project `.mdview.json`. Project config wins on scalar fields; `ignore` is unioned across both, so a per-repo extra doesn't drop your global build-dir list.
- **`mdview config` subcommand** — `mdview config path` prints the global config location; `mdview config ignore list / add <name…> / rm <name…>` reads and edits the ignore list without hand-editing the JSON. Adds validate against the same basename allow-list as the file loader.
- **Info icon in the file-tree pane head** with a tooltip explaining which folders are hidden and where to extend the list.
- **Helpful error on `EMFILE`/`ENOSPC`** at watcher startup — points the user at the global config file and shows the built-in defaults instead of crashing the process with a raw `UVException`.

## [0.4.0] — 2026-05-13

### Added
- **Browser tab favicon.** An accent-coloured italic "M" on a rounded square, served as `/favicon.svg`, so an mdview tab is visually distinguishable from other localhost tabs. Pure SVG — scales crisply at any tab size, no PNG variants needed.
- **Cmd/Ctrl-click a file in the tree to open it in a new tab.** File rows are now real anchors (`<a href="/?file=…">`) instead of buttons, which also enables middle-click → new tab, right-click → "Open link in new tab" / "Copy link", and hover URL preview in the browser status bar. Plain click still uses SPA navigation (no page reload). Non-markdown rows remain non-interactive.

## [0.3.1] — 2026-05-12

### Changed
- **Outline level filter is now a 2-thumb range slider** instead of six H1–H6 toggle pills. Pick any contiguous heading-level band — e.g. just H2–H3, or H1–H6 for the full outline. State persists as `mdview-outline-min-level` + `mdview-outline-max-level`. The setters auto-correct inversion (drag min past max → both move together), so the user is never trapped at a single level.
- **Outline collapse button moved to the inner edge of the outline head** (left side, facing the main pane) to match the standard IDE pattern where pane collapse arrows live on the side facing the content area. The file-tree collapse button is unchanged — it already sat on its inner (right) edge.

### Added
- **Outline pane content pads itself away from the minimap** when both are visible — outline list entries no longer sit under the minimap bars. (Minimap remains at the viewport right edge as before; padding handled via a `has-minimap` class on the shell.)

### Fixed
- **Theme / palette / wide-layout no longer flash the default on reload.** The pre-paint bootstrap script in `index.html` had been silently blocked by the strict `script-src 'self'` CSP since 0.2.0 (CSPs forbid inline scripts without an explicit hash or `'unsafe-inline'`). Moved the bootstrap to an external `/bootstrap.js` served from `public/` — runs synchronously before first paint, satisfies the CSP without weakening it. Also extends to the new `data-wide` attribute added in 0.2.1.
- **Slider thumbs are now vertically centred on the track line.** WebKit was rendering the 14 px range thumbs aligned to the top of the runnable track; fixed by setting the runnable-track height to 4 px and adding `margin-top: -5px` on the thumb so it centres on the visual line.

### Security
- Bumped `mermaid` 11.3 → 11.15 to clear four moderate advisories: `GHSA-87f9-hvmw-gh4p` (CSS injection via config), `GHSA-6m6c-36f7-fhxh` (Gantt-chart infinite-loop DoS), `GHSA-ghcm-xqfw-q4vr` (HTML injection via `classDef` in state diagrams), `GHSA-xcj9-5m2h-648r` (CSS injection via `classDefs`).

## [0.3.0] — 2026-05-11

### Changed
- **Focus mode now anchors to the top-third reading band (~35% of viewport) instead of the viewport top.** The bright section is always the one under your eyes; previously it could lag behind into a heading that had scrolled off-screen pages ago, with the dim covering the content you were actually reading. Breadcrumb / outline / minimap continue to anchor at the viewport top (they answer "where am I in the doc?"); focus mode answers a different question ("what am I reading right now?"). Implemented as a separate `focusedHeadingId` signal in `useScrollSpy`.

## [0.2.1] — 2026-05-11

### Added
- **Wide layout** toggle widens the reading column from 70ch to 100ch for docs that benefit from more horizontal space (tables, wide code blocks). Persisted as `mdview-wide-layout` and bound to the `w` keyboard shortcut.
- **Consolidated View menu** in the header — a single gear-icon popover containing Focus mode, Minimap, Wide layout, and the palette picker. Replaces the row of five separate header buttons. Theme and shortcuts (`?`) remain as standalone icons.

### Changed
- **Tree and outline collapse controls now live inside their respective panes** (a small head bar with the section label and a collapse button). The duplicate toggle buttons on the left and right edges of the header have been removed. The vertical "FILES" / "OUTLINE" rail buttons (shown when a pane is collapsed) are unchanged and remain the way to expand a collapsed pane.

### Removed
- `PalettePicker.tsx` component (replaced by the palette section inside `ViewMenu.tsx`).

## [0.2.0] — 2026-05-11

### Added
- **`high-contrast` palette** alongside classic / paper / nord / solarized — pure-white-on-near-black prose and bold accents in dark mode, mirror in light mode. Code blocks use `github-light-high-contrast` / `github-dark-high-contrast`.
- **Alt/Option + scroll wheel** multiplies scroll speed (~4×) in the main pane, matching JetBrains/VS Code behavior. Works on macOS, Windows, and Linux.
- `--version` / `-v` flag prints the package version.
- Cross-platform port-in-use hint (macOS / Linux / Windows).
- `LICENSE` file (MIT).
- Standard publish metadata in `package.json` (`license`, `repository`, `keywords`, `author`, `homepage`, `bugs`).

### Changed
- **Code blocks now follow the active palette.** Shiki renders 10 theme variants per token (5 palettes × light/dark) inline as CSS variables; CSS selects the variant based on `[data-palette][data-theme]`. Switching palette updates syntax highlighting instantly with no re-render. Mapping: classic → github, paper → min-light / vitesse-dark, nord → min-light / nord, solarized → solarized-*, high-contrast → github-*-high-contrast.
- **Focus mode, outline, breadcrumb, and minimap now share one source of truth** (`activeHeadingId`). Replaces the divergent center-of-viewport algorithm — focus dim and outline highlight always agree on the active section.
- Doc search (`SearchBar`) is now debounced at 150 ms so fast typing doesn't thrash regex matching + DOM highlighting on long docs. Folder search keeps its 250 ms debounce, now sharing the same `debounce` utility.
- Tagged relative `.md` links render with `href="?file=…"` instead of the raw path, so cmd/ctrl+click opens the right URL in a new tab with no server-redirect round-trip.
- `package.json` `files` tightened to ship only `bin/mdview.mjs`, `dist`, `README.md`, `LICENSE`, `CHANGELOG.md` (drops the bundled source map).

### Fixed
- **Theme and palette no longer flash the default on reload.** An inline `<head>` script applies `data-theme` and `data-palette` synchronously before first paint. The previous code path waited for the React app to mount, causing a brief FOUC and occasional silent reset on Safari ITP / private browsing.
- **Relative `.md` links from rendered markdown open the correct file** when clicked (regular click and cmd/ctrl+click). Previously the server's SPA fallback returned `index.html` for any unmatched path, so clicking `[label](other.md)` could open a random last-viewed file. Now the server 302-redirects unmatched `.md` paths to `/?file=…`, and the client intercepts same-origin `.md` anchors as a belt-and-suspenders fallback.
- **First and last sections can now become the active heading** at scroll boundaries, in outline, focus mode, minimap, and breadcrumb. Previously short first/last sections (shorter than half the viewport) could never be highlighted because the topmost-passed heuristic couldn't reach them.
- URL-encoded markdown link paths (`foo%20bar.md`) no longer double-encode through the SPA router — `data-internal-link` stores the decoded path so the router's `encodeURIComponent` produces the right URL.
- `persisted-signal` now warns once when `localStorage` access throws (Safari ITP / private mode), making the silent-reset case debuggable.
- Folder-wide search now handles Windows CRLF (`\r\n`) line endings correctly.
- CLI rejects extra positional arguments instead of silently dropping all but the last.

### Security
- Content-Security-Policy and supporting headers (`X-Content-Type-Options`, `Referrer-Policy`) are set on every HTML response. Inline scripts in user markdown can no longer execute by default.
- `/__asset/*` now allow-lists known media MIME types and 404s everything else — arbitrary file reads of `.env`, dotfiles, source code etc. through the asset route are blocked.
- `/api/file` rejects requests for non-markdown paths (`.md`, `.markdown`, `.mdx` only).
- Folder-wide regex search caps execution at ~5 ms per line and reports `truncated: true` rather than freezing the event loop on pathological inputs (ReDoS mitigation).
- Server's 404 redirect for unmatched `.md` paths URL-encodes the target and rejects CR/LF in the request path to prevent open-redirect and HTTP response-splitting attacks.
- Bumped `@fastify/static` 8 → 9.1.3 (fixes GHSA-pr96-94w5-mx2h directory-listing traversal and GHSA-x428-ghpx-8j92 encoded-separator route bypass).
- Bumped dev deps to clear remaining advisories: `happy-dom` 15 → 20.9.0 (GHSA-37j7-fg3j-429f VM context escape), `vitest` 2 → 3.2.4 + `vite` → 6.4.2 (pulls in patched `esbuild`).

## [0.1.0] — 2026-05

Initial v1 release plus phase-2 features. Highlights:

### Added
- Local CLI markdown viewer: `mdview [path]` serves a folder or single file on `127.0.0.1` and opens the browser.
- 3-pane layout with collapsible, resizable sidebars (folder tree + outline). Widths persisted to `localStorage`.
- Live reload via SSE + chokidar; scroll and outline state preserved.
- Markdown rendering: GFM, Shiki dual-theme syntax highlighting, mermaid (lazy), KaTeX math (lazy), tables, frontmatter, task lists.
- Heading permalinks, code copy buttons, external-link indicators, image lightbox with relative-path resolution via `/__asset/*`.
- In-doc search (`/`, `⌘F`) with prev/next/match-counter.
- Folder-wide grep search, grouped by file, with snippets.
- Theme toggle (light/dark, OS-driven + manual override, persisted) plus built-in palettes (classic / paper / nord / solarized).
- Vim-style shortcuts (`gg`, `G`, `H`/`L`, `]`/`[`, `Ctrl+D`/`Ctrl+U`) and a shortcuts panel (`?`).
- Reading progress bar, doc stats (reading time, words, headings), focus mode + minimap.
- Per-project `.mdview.json` config (palette, font, line-width, default-collapsed sidebars).
- Friendly CLI error messages and graceful shutdown.

[Unreleased]: https://github.com/hardikg2907/mdview/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/hardikg2907/mdview/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/hardikg2907/mdview/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/hardikg2907/mdview/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/hardikg2907/mdview/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/hardikg2907/mdview/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/hardikg2907/mdview/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/hardikg2907/mdview/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/hardikg2907/mdview/releases/tag/v0.1.0
