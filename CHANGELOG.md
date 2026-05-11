# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: about:blank
[0.2.0]: about:blank
[0.1.0]: about:blank
