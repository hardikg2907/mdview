# mdview — TODO

Roadmap of pending work. v1 and phases 2 and 3 are shipped and in active use.
Phase 4 (editor extensions) is partly done: the VS Code extension works and is
on `main`, but it has never been published.

---

## Wrap-up (do soon, before phase 2)

- [x] Update `README.md` to reflect the real v1 feature set
- [x] Update `VERIFICATION.md` to match reality
- [x] Add `docs/ARCHITECTURE.md`, `docs/CONTRIBUTING.md`, `docs/FEATURES.md` for new agents/contributors
- [x] `npm install -g .` — verify global install works and `mdview` is on PATH
- [ ] Dogfood: use `mdview` as the daily md reader for at least a week before starting phase 2 — surface real papercuts

---

## Phase 2

Originally-deferred MVP-adjacent features. Build as a coordinated push once v1 has been used enough to validate the shape.

- [x] **Folder-wide search** — server endpoint that greps every md file in the open folder; results grouped by file with snippets; reuse the existing search-bar UI for input + a result-list panel.
- [~] **Static export** — dropped. Bundle-size cost (KaTeX SSR + duplicated render code) didn't justify the use case; the live server is the canonical way to read mdview content.
- [x] **Resizable sidebars** — drag handles between tree/content and content/outline panes; persist widths to `localStorage`; snap to default at min threshold; collapse if dragged below threshold.
- [x] **Math / LaTeX** — KaTeX, dynamically imported only when a doc contains `$...$` or `$$...$$`; same lazy pattern as mermaid.
- [x] **Custom themes / per-project config** — read `.mdview.json` at folder root for palette, font, line-width, default-collapsed states; built-in theme picker in header (classic / paper / nord / solarized).
- [x] **Extended vim-style shortcuts** — `gg` / `G` top/bottom; `H` / `L` prev/next file; `]` / `[` next/prev heading at same level; `Ctrl+D` / `Ctrl+U` half-page scroll. (`n` / `N` deferred — needs persisted-search-state plumbing.) Reflect in shortcuts panel.
- [x] **Focus mode / minimap** — focus mode dims everything except the section whose content is at the viewport center; thin minimap rail at right edge showing doc structure, draggable to scroll.

---

## Phase 4 — Editor extensions (VS Code, Zed)

Distribute the viewer as a native side-panel inside the user's editor instead of
(or alongside) the standalone server. The VS Code extension lives in
`apps/vscode` as a side-by-side package with its own deps and test suite; design
notes are in `docs/superpowers/specs/2026-05-24-vscode-extension-design.md`.

- [x] **VS Code extension** — webview panel that renders the active `.md` file using the mdview UI, auto-updates when the editor's active file changes, and follows the in-editor theme. It spawns the CLI per workspace folder (`ServerPool`) and frames the SPA through VS Code's webview resource proxy.
- [x] **Editor-aware features** — heading and internal-link clicks in the preview move the editor cursor and reveal the line; moving the cursor scrolls the preview to the nearest heading at or above it, debounced, with a suppression window so the two don't chase each other.
- [ ] **Publish to the Marketplace** — still `0.1.0` and unpublished. Needs a publisher account, an icon, a README with screenshots, and a real `CHANGELOG` for the extension itself. The integration test runner (`@vscode/test-electron`) has never been run in CI.
- [ ] **Zed extension** — equivalent for Zed once their extension API supports webviews; similar UX (split-pane preview, theme follow, live update on save).
- [ ] **Architecture** — extract the rendering pipeline + frontend into a reusable package so the standalone CLI, VS Code extension, and Zed extension all share one codebase. The extensions would then ship the renderer in-process instead of spawning a Node server, which is what the current extension does.
- [ ] **Watch scope** — optionally watch only the active file rather than the whole workspace folder.

## Phase 3 — Workspaces

One background server hosts every folder you open. Shipped, with two differences
from the original sketch: folders are shown *together* rather than switched
between, and each is identified by a root id that prefixes every path on the wire
instead of by a `/<name>/api/...` route prefix.

- [x] **Workspace registry** — `mdview <path>` adds, `mdview ls` lists, `mdview rm <name|path>` removes; storage at `~/.config/mdview/workspace.json`.
- [x] **Single long-running server** — detached on first use, all folders watched simultaneously, one chokidar instance per folder, `mdview stop` to end it.
- [x] **Backwards-compat** — `--foreground` is the old behaviour, and `--port` / `--palette` / `--vscode` imply it, so every pre-daemon invocation is unchanged.
- [x] **Lifecycle** — port persisted in `daemon.json`; runs until `mdview stop`, with opt-in idle shutdown via `MDVIEW_IDLE_TIMEOUT`. No auto-start at login and no tray icon: neither earns its keep when `mdview <path>` starts the server in under a second.
- [ ] **No-port URL** — `mdview service install` / `uninstall`: one sudo, a kernel redirect from :80 to the server's port (pfctl / iptables / netsh) plus a launchd or systemd unit to reapply it after reboot, so the URL is just `http://mdview.localhost`. The server stays unprivileged. Deliberately deferred — three platform implementations and a reversible uninstall is a feature of its own.
- [ ] **Per-workspace state** — sidebar widths, theme override, recent files, search history scoped to the active folder. Currently all window-level and shared, which is right for panes and theme but arguably wrong for recent files.
- [ ] **Switcher UI** — only worth building if showing every folder at once turns out not to scale past a handful.

---

## Bugs / Polish (open)

- [x] **Code-block payload scales with the palette count** (fixed in 0.9.0). `render/shiki.ts` used to render every palette, putting one CSS variable per (palette, mode) on every token — 16 of them at 8 palettes. It now renders only the requested palette's light/dark pair, so a token carries two. `/api/file` takes a `palette` query param, validated against the allow-list; the client refetches on a palette change and the light/dark toggle still repaints with no request. `test-fixtures/showcase.md` went from **204 KB to 30 KB** (6.8x), and is now smaller than it was at five palettes.

- [x] **Pre-commit hooks** (landed 0.6.1) — husky v9 with `pre-commit` (`typecheck && lint && test && audit`, ~7s) and `pre-push` (`build`, ~25s). Linter is biome (single binary, no plugin chain), a11y off because the custom widgets are intentionally non-standard. Audit was added to the commit hook too, with an offline-bypass note in CONTRIBUTING.

---

## Done (v1 highlights — for reference)

- 3-pane layout with collapsible sidebars (rail labels when collapsed)
- Theme toggle (light/dark, OS-driven + manual override, persisted)
- Folder tree, outline (scroll-spy + collapsible), breadcrumbs (clickable)
- Live reload via SSE + chokidar; scroll/outline state preserved
- Markdown rendering: GFM, Shiki dual-theme syntax highlighting, mermaid (lazy), tables, frontmatter, task lists
- Heading permalinks (hover # to copy URL)
- Code copy buttons
- External link `↗` indicator + new-tab opening
- Image lightbox with relative-path resolution via `/__asset/*`
- In-doc search (`/`, `⌘F`, with prev/next/match-counter)
- Keyboard shortcuts (full set) + shortcuts panel (`?` to open)
- Reading progress bar
- Doc stats (reading time, words, headings)
- Loading skeleton
- Editorial typography (serif body, italic accent H1, paper-grain texture)
- Custom checkboxes for task lists
