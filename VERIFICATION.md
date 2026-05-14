# Manual verification scenarios

Walk through these against `test-fixtures/` after any meaningful change. Subjective — meant for human eyes, not CI.

## Setup

```bash
npm install && npm run build
node bin/mdview.mjs ./test-fixtures --no-open
# open http://127.0.0.1:7331/ in a browser
```

## Scenarios

### 1. Single-file mode
```bash
node bin/mdview.mjs ./test-fixtures/showcase.md --no-open
```
- Folder tree shows one item (the file).
- Outline pulls headings from the doc.
- Edit the file in another editor, save → view updates, scroll position preserved.

### 2. Folder mode
- Folder tree shows nested structure (`assets/`, `linked-doc.md`, `math.md`, `showcase.md`).
- Click `linked-doc.md` → renders in the viewer (no full page reload).
- **Cmd/Ctrl + click `linked-doc.md` in the file tree** → opens that file in a **new tab** with URL `?file=linked-doc.md`. Middle-click and right-click → "Open link in new tab" also work.
- Internal `[link](./linked-doc.md)` inside `showcase.md` navigates same way.
- **Cmd/Ctrl + click** on the same internal link → opens that file in a **new tab**, with the URL `?file=…` populated correctly (not `/path/to/file.md`). The new tab shows the right file, not a random last-viewed one.
- A link with a percent-encoded space, e.g. `[x](some%20doc.md)`, resolves to the file literally named `some doc.md` (no double-encoding).
- Internal `[anchor](#some-id)` jumps within the doc.

### 3. Long-doc orientation
- Outline lists every heading; depth visible via indentation + decay.
- Scroll to a deep subsection → breadcrumb path updates, outline highlights the right item (the topmost heading you've passed).
- Click any outline item → smooth scrolls there + the active highlight pins on the right one immediately (no flicker mid-scroll).
- Click any breadcrumb segment → smooth scroll to that level.
- Hover any heading → top of viewport leaves only ~16 px of breathing room above it.

### 4. Resizable sidebars
- Hover the seam between tree pane and main → cursor becomes `col-resize`; a 1 px accent line appears.
- Drag right → tree widens; drag left → tree narrows. Same on the right seam for the outline.
- Reload — widths persist.
- Drag below the collapse threshold (~140 px) → pane snaps to collapsed rail and width resets to default.
- `⌘B` / `⌘.` still toggle correctly afterwards.

### 4a. Collapse controls live inside the panes
- Tree expanded → "Files" head bar at the top of the tree pane has a single collapse button on the right (`⌘B` tooltip). Header has no tree-toggle button.
- Click the in-pane button → tree collapses to the vertical "FILES" rail. Click the rail → tree expands again.
- Outline expanded → outline head row shows the level pills and a single collapse button (`⌘.` tooltip). Header has no outline-toggle button.
- Both controls remain consistent through `⌘B` / `⌘.` keyboard toggles.

### 4b. View menu + wide layout
- Header right side shows three icons: a gear (View), theme toggle, and the keyboard `?` button. Nothing else.
- Click the gear → popover lists Focus mode, Minimap, Wide layout, a divider, and five palette swatches with checks on the active palette.
- Toggle "Wide layout" (or press `w`) → main column visibly relaxes from ~70ch to ~100ch; reload persists the choice.
- Toggle Focus, Minimap, and palettes from inside the menu — behavior matches the previous separate buttons.

### 5. Outline level filter
- Outline header shows six small pills `1 2 3 4 5 6`.
- Click `5` and `6` → headings at those levels disappear; their children (if any) get promoted up.
- Reload — pill state persists.
- Re-enable a level → its headings reappear in document order.

### 6. Code blocks
- Multiple languages render with Shiki highlighting; the font is JetBrains Mono.
- Hover a code block → "Copy" button appears top-right.
- Click "Copy" → clipboard receives the code; button briefly says "Copied".
- Switch palette via the header swatch (classic ↔ nord ↔ solarized ↔ high-contrast) → code-block colors update **instantly**, no re-render and no flash. Each palette uses a tailored Shiki theme.

### 7. Mermaid
- Mermaid block renders as an SVG diagram.
- Open DevTools → Network: the `mermaid.core` chunk only loads on a page that contains a mermaid block.

### 8. Math (KaTeX)
- Open `test-fixtures/math.md`. Inline `$a^2 + b^2 = c^2$` and the two `$$...$$` block expressions render with KaTeX.
- DevTools → Network: a `katex` chunk + `katex.min.css` only load when a doc contains math (e.g. `showcase.md` should NOT trigger them).
- `$5.99 plus $1` and `` `$x = 5$` `` should NOT render as math (whitespace/code-span heuristics).

### 9. Themes & palettes
- Theme toggle (sun/moon icon, header right) flips light/dark instantly.
- Palette picker icon (palette/swatch, header right) opens a menu with five swatches: classic / paper / nord / solarized / high-contrast. Click any → page palette and code-block colors swap live.
- High-contrast in dark mode → near-pure-white text on near-black background, bold accent. Light mode → mirror.
- Reload — both theme and palette persist **without a flash of the default** (an inline `<head>` script applies them before first paint).
- Hard-reload in Safari private mode → theme/palette still applies; check DevTools console for a single `mdview: localStorage access blocked` warning (acceptable, not an error).
- `⌘\` shortcut also toggles theme.

### 10. Per-project config (`.mdview.json`)
- A `.mdview.json` already exists in `test-fixtures/` setting `palette: "nord"`.
- On first load (with no user palette override yet), the page should boot in Nord.
- Pick a different palette manually → user override wins, persists.
- Edit `.mdview.json` to a different palette and save → if no user override is active, the page palette swaps live.

### 10a. Global config + ignore list + `mdview config` CLI
- `mdview config path` → prints `~/.config/mdview/config.json` (or `$XDG_CONFIG_HOME/mdview/config.json` if set).
- `mdview config ignore list` → prints the built-in defaults followed by user-added entries (or `(none)`).
- `mdview config ignore add deps _site` → file is created if missing; lists `_site, deps` alphabetically; prints "Restart mdview…".
- `mdview config ignore rm deps` → file is rewritten without `deps`; `ignore` field is removed entirely when the list goes empty.
- `mdview config ignore add ../escape` → exits with code 2 and a `Invalid ignore entry` message; file is unchanged.
- `mdview config ignore add` with no name → exits with code 2 and a usage hint.
- Create `~/.config/mdview/config.json` containing `{ "ignore": ["my-bulk-dir"] }`.
- Run mdview on a folder that contains `my-bulk-dir/` with files inside → that directory does not appear in the tree.
- Run mdview on a folder containing `node_modules/`, `dist/`, `_build/`, `target/`, or `__pycache__/` → none appear in the tree by default, and the watcher does **not** crash with `EMFILE: too many open files`.
- Hover the small `(i)` icon in the "Files" pane head → tooltip explains the defaults and points at `~/.config/mdview/config.json` with the schema.
- Set both `~/.config/mdview/config.json` and a project `.mdview.json` with different palettes → project wins. Set `ignore` in both → the union takes effect.
- Run mdview, then add a new entry to the global config's `ignore` while running → not picked up. Restart → now picked up. (Documented behavior.)

### 11. Anchors
- Hover any heading → `#` appears on the right.
- Click it → URL copied to clipboard.
- Paste URL into a new tab → lands at exactly that section.

### 12. In-doc search
- Press `/` or `⌘F` → search bar opens, input auto-focused, scope toggle defaults to `Doc`.
- Type a word → matches highlight in content; counter shows "1 / N".
- Press `Enter` → next match (smooth scrolls into view).
- Toggle `Aa` (case-sensitive), `ab` (whole-word), `.*` (regex) → result count updates accordingly.
- Press `Esc` → search closes, highlights cleared.

### 13. Folder-wide search
- Press `⇧⌘F` (or click the `Folder` pill in the search bar) → scope switches to `Folder`.
- Type a query → 250 ms debounce, then a result list appears below the input grouped by file with snippets and line numbers.
- Click a result → that file opens; search closes.
- Tab in the input cycles back to `Doc` scope.
- Try with `regex` mode (e.g. `\d+`) → matches numbers across all md files.

### 14. Quick switcher
- Press `⌘P` → palette opens.
- Type a fragment → results filter, accent-colored letters show what matched.
- Arrow keys navigate; Enter opens; Esc closes.
- Current file shows a "current" tag.

### 15. Vim shortcuts
- `j` / `k` step through headings.
- `gg` (within 600 ms) jumps to top; `⇧G` jumps to bottom.
- `[` / `]` jump to previous / next heading at the same level.
- `⇧H` / `⇧L` open previous / next markdown file in the folder.
- `Ctrl+D` / `Ctrl+U` half-page scroll.
- Hold `Alt` (Windows/Linux) or `⌥ Option` (macOS) while scrolling the mouse wheel / trackpad → scroll speed multiplies (~4×) in the main pane. Without the modifier, scroll behaves normally.
- All entries appear in the shortcuts panel (`?`).

### 16. Focus mode
- Toggle focus mode (View menu → Focus mode, or `f` key).
- The section currently under your eyes (the heading just above the top-third line, ~35 % from the viewport top) is bright; everything else dims to 25 %.
- Scroll slowly through a long section: the focus highlight stays on that section until the **next** heading enters the reading zone — then it hands off. Compare with the outline / breadcrumb / minimap, which still highlight the previous heading until it scrolls past the viewport top (the two anchors are intentionally different — navigation answers "where am I in the doc?", focus answers "what am I reading right now?").
- Scroll to the very top → the **first** heading's section is focused. Scroll to the very bottom → the **last** heading's section is focused, even if that last section is shorter than half the viewport.
- Click a heading in the outline → focus jumps to that section immediately (does not wait for the scroll animation).
- Refresh while focus mode is on → dimming applies as soon as the file loads.

### 17. Minimap
- Toggle minimap (header bar-grid button or `m` key).
- A thin rail appears at the right edge with one bar per heading; bar width decays with depth.
- Active heading bar is accent-coloured + slightly taller.
- A faint viewport indicator slides as you scroll.
- Click anywhere on the rail → smooth-scroll to that ratio of the doc.

### 18. Last-updated stamp
- Below the H1, the doc-stats strip ends with `Updated N ago`. Hover → tooltip shows the absolute timestamp.
- Edit the file and save → stamp re-renders to "just now" (live reload).

### 19. Images & lightbox
- `wave.svg` and `star.svg` render inline at their relative paths.
- Hover an image → cursor becomes `zoom-in`.
- Click → fullscreen lightbox with backdrop blur.
- Esc or click outside → closes.

### 20. External links
- External links (e.g. https://vercel.com) get a small `↗` icon after the link text.
- Click → opens in new tab.
- Hover → icon brightens to accent color and lifts slightly.

### 21. Task lists
- `- [x] done` → custom-styled accent-filled checkbox with white check.
- `- [ ] todo` → hollow checkbox.
- No bullet point in front of checkboxes.

### 22. Live reload
- Edit `showcase.md` in another editor (add a heading or change a paragraph).
- Save — view re-renders within ~100 ms.
- Scroll position is preserved.

### 23. Sidebar collapse
- Click the panel-left icon (header left) → tree collapses to a thin "FILES" rail; click rail to re-expand.
- Same on the right with the panel-right icon and outline.
- Reload — collapse state persists.

### 24. Tooltips
- Hover any header control (theme toggle, focus mode, minimap, palette picker, sidebar toggles, keyboard icon) → small dark tooltip appears below after a brief delay.
- Same for the `Aa` / `ab` / `.*` search options and the `H1`–`H6` outline pills.

### 25. Shortcuts panel
- Press `?` (or click the keyboard icon in the header) → modal lists all shortcuts in three groups (Navigation / Find / View).
- Esc or click-outside closes.

### 26. Errors & shutdown
- Run `mdview ./does-not-exist` → friendly `mdview: path not found: ...` error, exit code 1.
- Run two `mdview` instances at the same explicit `--port 7331` → second one prints port-already-in-use guidance, exit code 1. Without `--port`, second instance auto-falls-back to 7332 and prints `port 7331 in use, using 7332 instead`.
- `Ctrl+C` once → graceful shutdown ("mdview: shutting down…", clean exit). `Ctrl+C` twice → force-exit (130).
- Set `MDVIEW_DEBUG=1` and trigger an error → full stack trace printed.

## Tests

```bash
npm test            # 216 vitest unit tests
npm run typecheck   # both tsconfigs clean
```

## Known follow-ups

See [`TODO.md`](TODO.md) for the phase 3 (workspaces) and phase 4 (editor extensions) roadmap.
