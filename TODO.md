# mdview — TODO

Roadmap of pending work. v1 is shipped and in active use; phases 2 and 3 are the next pushes.

---

## Wrap-up (do soon, before phase 2)

- [ ] Update `README.md` to reflect the real v1 feature set (theme toggle, search, permalinks, copy buttons, lightbox, doc stats, shortcuts panel, etc.)
- [ ] Update `VERIFICATION.md` to match reality
- [ ] `npm install -g .` — verify global install works and `mdview` is on PATH
- [ ] Dogfood: use `mdview` as the daily md reader for at least a week before starting phase 2 — surface real papercuts

---

## Phase 2

Originally-deferred MVP-adjacent features. Build as a coordinated push once v1 has been used enough to validate the shape.

- [ ] **Folder-wide search** — server endpoint that greps every md file in the open folder; results grouped by file with snippets; reuse the existing search-bar UI for input + a result-list panel.
- [ ] **Static export** — `mdview --export <out>`: pre-render every md file in the folder to a self-contained HTML bundle; inline assets (or copy to `out/__asset/`); simulate folder navigation client-side; no runtime server required.
- [ ] **Resizable sidebars** — drag handles between tree/content and content/outline panes; persist widths to `localStorage`; snap to default at min threshold; collapse if dragged below threshold.
- [ ] **Math / LaTeX** — KaTeX, dynamically imported only when a doc contains `$...$` or `$$...$$`; same lazy pattern as mermaid.
- [ ] **Custom themes / per-project config** — read `.mdview.json` at folder root for palette, font, line-width, default-collapsed states; built-in theme picker in header (classic / paper / nord / solarized).
- [ ] **Extended vim-style shortcuts** — `gg` / `G` top/bottom; `H` / `L` prev/next file; `n` / `N` next/prev search match; `]` / `[` next/prev heading at same level; `Ctrl+D` / `Ctrl+U` half-page scroll. Reflect in shortcuts panel.
- [ ] **Focus mode / minimap** — focus mode dims everything except the section under the active heading; thin minimap rail at right edge showing doc structure, draggable to scroll.

---

## Phase 4 — Editor extensions (VS Code, Zed)

Distribute the viewer as a native side-panel inside the user's editor instead of (or alongside) the standalone server.

- [ ] **VS Code extension** — webview panel that renders the active `.md` file using the mdview UI; auto-updates when the editor's active file changes; shares the in-editor theme; published to the VS Code Marketplace.
- [ ] **Zed extension** — equivalent for Zed once their extension API supports webviews; similar UX (split-pane preview, theme follow, live update on save).
- [ ] **Architecture** — extract the rendering pipeline + frontend into a reusable package so the standalone CLI, VS Code extension, and Zed extension all share one codebase. The extensions ship the renderer in-process (no spawning a Node server).
- [ ] **Editor-aware features** — "Reveal in editor" link to jump back to source line, sync scroll position with editor cursor, optionally watch only the active file rather than the workspace.

## Phase 3 — Workspaces

Bigger architectural shift: one long-running server hosts multiple "workspaces" (named projects), switchable from the UI without restarting.

- [ ] **Workspace registry** — `mdview workspace add <path> --name <name>`, `mdview workspace list`, `mdview workspace remove <name>`; storage at `~/.config/mdview/workspaces.json`.
- [ ] **Single long-running server** — `mdview` (no args) boots in registry mode with all workspaces watched simultaneously; per-workspace routes `/<name>/api/...`; chokidar instance per workspace.
- [ ] **Workspace switcher UI** — dropdown / command palette in the header listing registered workspaces; click to switch routes.
- [ ] **Per-workspace state** — sidebar widths, theme override, recent files, search history scoped to the active workspace.
- [ ] **Backwards-compat** — `mdview <path>` still works as today (ephemeral one-off workspace).
- [ ] **Lifecycle decisions** — auto-start at login? tray icon? port persistence? (Decide when we get there — different product trade-offs.)

---

## Bugs / Polish (open)

_(none currently flagged — last fix: scroll-spy off-by-pixels on outline jump, 5f383d2)_

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
