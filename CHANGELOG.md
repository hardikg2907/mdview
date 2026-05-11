# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `--version` / `-v` flag prints the package version.
- Cross-platform port-in-use hint (macOS / Linux / Windows).
- `LICENSE` file (MIT).
- Standard publish metadata in `package.json` (`license`, `repository`, `keywords`, `author`, `homepage`, `bugs`).

### Changed
- `package.json` `files` tightened to ship only `bin/mdview.mjs`, `dist`, `README.md`, `LICENSE`, `CHANGELOG.md` (drops the bundled source map).

### Fixed
- Folder-wide search now handles Windows CRLF (`\r\n`) line endings correctly.
- CLI rejects extra positional arguments instead of silently dropping all but the last.

### Security
- Content-Security-Policy and supporting headers (`X-Content-Type-Options`, `Referrer-Policy`) are set on every HTML response. Inline scripts in user markdown can no longer execute by default.
- `/__asset/*` now allow-lists known media MIME types and 404s everything else — arbitrary file reads of `.env`, dotfiles, source code etc. through the asset route are blocked.
- `/api/file` rejects requests for non-markdown paths (`.md`, `.markdown`, `.mdx` only).
- Folder-wide regex search caps execution at ~5 ms per line and reports `truncated: true` rather than freezing the event loop on pathological inputs (ReDoS mitigation).
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
[0.1.0]: about:blank
