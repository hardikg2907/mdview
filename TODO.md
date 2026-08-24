# mdview — TODO

Roadmap of pending work. v1 and phases 2 and 3 are shipped and in active use; phase 4 (editor extensions) is in progress on a branch.

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

Distribute the viewer as a native side-panel inside the user's editor instead of (or alongside) the standalone server.

- [ ] **VS Code extension** — webview panel that renders the active `.md` file using the mdview UI; auto-updates when the editor's active file changes; shares the in-editor theme; published to the VS Code Marketplace.
- [ ] **Zed extension** — equivalent for Zed once their extension API supports webviews; similar UX (split-pane preview, theme follow, live update on save).
- [ ] **Architecture** — extract the rendering pipeline + frontend into a reusable package so the standalone CLI, VS Code extension, and Zed extension all share one codebase. The extensions ship the renderer in-process (no spawning a Node server).
- [ ] **Editor-aware features** — "Reveal in editor" link to jump back to source line, sync scroll position with editor cursor, optionally watch only the active file rather than the workspace.

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
