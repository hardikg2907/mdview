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
- Click the gear → popover lists Focus mode, Minimap, Wide layout, a divider, and eight palette swatches with checks on the active palette.
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
- Switch palette via the header swatch (flexoki ↔ everforest ↔ catppuccin ↔ high-contrast) → code-block colors update **instantly**, no re-render and no flash. Each palette uses a tailored Shiki theme.

### 7. Mermaid
- Mermaid block renders as an SVG diagram.
- Open DevTools → Network: the `mermaid.core` chunk only loads on a page that contains a mermaid block.

### 8. Math (KaTeX)
- Open `test-fixtures/math.md`. Inline `$a^2 + b^2 = c^2$` and the two `$$...$$` block expressions render with KaTeX.
- DevTools → Network: a `katex` chunk + `katex.min.css` only load when a doc contains math (e.g. `showcase.md` should NOT trigger them).
- `$5.99 plus $1` and `` `$x = 5$` `` should NOT render as math (whitespace/code-span heuristics).

### 9. Themes & palettes
- Theme toggle (sun/moon icon, header right) flips light/dark instantly.
- Palette picker icon (palette/swatch, header right) opens a menu with eight swatches: flexoki / paper / solarized / everforest / rose-pine / kanagawa / catppuccin / high-contrast. Click any → page palette and code-block colors swap live.
- In each palette, look at the page background at 100% zoom: the paper grain should read as a tint of that palette's own text colour, never as a warm brown wash over a cool ground. On `high-contrast` there should be **no** grain at all.
- Switch to `rose-pine` or `catppuccin`, then toggle light/dark → grain, code background and quote bar all stay inside that palette.
- High-contrast in dark mode → near-pure-white text on near-black background, bold accent. Light mode → mirror.
- Reload — both theme and palette persist **without a flash of the default** (an inline `<head>` script applies them before first paint).
- Hard-reload in Safari private mode → theme/palette still applies; check DevTools console for a single `mdview: localStorage access blocked` warning (acceptable, not an error).
- `⌘\` shortcut also toggles theme.

### 10. Per-project config (`.mdview.json`)
- A `.mdview.json` already exists in `test-fixtures/` setting `palette: "everforest"`.
- On first load (with no user palette override yet), the page should boot in Everforest.
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
- Collapse one or more sections, then open search and type a query that matches text inside a collapsed section → match counter reflects the total. Pressing `Enter` to cycle into a hidden match expands its containing section first, then scroll-into-view lands on the highlighted word.

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

### 26. Collapsible sections
- Open a doc with multiple H2/H3 headings. Hover any heading → a small `▾` chevron fades in to the left of the title (alongside the existing `#` permalink on the right).
- Click the chevron → that heading's trailing content (everything until the next equal-or-shallower heading) collapses; the chevron rotates to `▸` and stays visible while the section is folded. Click again → expands.
- Collapse an H2 that has H3 children → the H3s and their content also fold (they're inside the H2's range).
- Collapse an H3 that's nested inside an H2 → only the H3's own content folds; the surrounding H2 content stays.
- Click the outline entry for a heading that's currently inside a collapsed section → the containing section auto-expands, then the smooth-scroll lands on the heading.
- Same for clicking a `#anchor` link in the doc body whose target is inside a collapsed section.
- Same for refreshing on a `#anchor` URL — auto-expand happens before the initial scroll-into-view.
- Press `e` → every section expands. Press `⇧E` → every section collapses. Doc becomes a stack of headings only.
- Edit the open file in another editor and save (live reload) → previously-collapsed sections stay collapsed; new headings appear expanded by default. Headings that were renamed or deleted gracefully fall out of the collapsed set (no errors).
- Switch to a different file in the tree → the new file opens with everything expanded (state doesn't leak across files).
- Print preview (Cmd/Ctrl+P) while some sections are collapsed → preview shows every section expanded. After closing print → the previously-collapsed sections are collapsed again.
- Keyboard: focus a chevron via Tab and press Space/Enter → toggles. `aria-expanded` reflects state on the button.

### 27. Errors & shutdown
- Run `mdview ./does-not-exist` → friendly `mdview: path not found: ...` error, exit code 1.
- Run two `mdview` instances at the same explicit `--port 7331` → second one prints port-already-in-use guidance, exit code 1. Without `--port`, second instance auto-falls-back to 7332 and prints `port 7331 in use, using 7332 instead`.
- `Ctrl+C` once → graceful shutdown ("mdview: shutting down…", clean exit). `Ctrl+C` twice → force-exit (130).
- Set `MDVIEW_DEBUG=1` and trigger an error → full stack trace printed.

### 28. `--palette` flag
- `mdview --palette kanagawa ./test-fixtures` → page renders in the `kanagawa` palette regardless of what `.mdview.json` configures. The on-disk config file is **not** modified.
- `mdview --palette banana ./test-fixtures` → exits with `Invalid --palette 'banana'. Valid: flexoki, paper, solarized, everforest, rose-pine, kanagawa, catppuccin, high-contrast`, exit code non-zero.
- `mdview --palette classic ./test-fixtures` and `mdview --palette nord ./test-fixtures` → both now rejected the same way. These two were removed; the error must list the replacements.
- Without `--palette` → existing behavior (whatever `.mdview.json` or global config says).

### 29. `--port 0` ephemeral
- `mdview --port 0 --no-open ./test-fixtures` → server binds on a kernel-assigned port. The actual port appears in the `mdview → http://127.0.0.1:<port>/` line so you can navigate manually.

### 30. `--vscode` embed mode (CLI side)
- `mdview --vscode --port 0 ./test-fixtures` → **single line** of JSON on stdout: `{"event":"ready","url":"http://127.0.0.1:<port>/","port":<port>}`. No "mdview → …" / "watching: …" human lines. No browser tab opens (`--vscode` implies `--no-open`).
- `curl -s -D - http://127.0.0.1:<port>/ | grep -i content-security-policy` → the header has **no** `frame-ancestors` directive at all. Run the same `curl` against a default-mode instance → header contains `frame-ancestors 'none'`. (0.7.1 dropped the directive under `--vscode` rather than widening it to `*`; Chromium 142 rejects the webview origin against a wildcard.)
- `(echo "" ; sleep 1) | node bin/mdview.mjs --vscode --port 0 ./test-fixtures` → the CLI prints its ready JSON, then exits cleanly on its own (exit code 0) when stdin closes. Default-mode invocations are unaffected by stdin close.

### 31. SPA embed mode (`?embed=vscode`)
Set up a small iframe harness (the SPA's embed mode requires both the `?embed=vscode` query *and* being framed; opening the URL directly in a browser tab won't activate it):

```bash
# Terminal 1 — server with --vscode so framing is allowed (no frame-ancestors)
mdview --vscode --port 7331 ./test-fixtures

# Terminal 2 — serve a one-page harness over HTTP (file:// can't frame http:// in Chrome)
mkdir -p /tmp/mdview-harness && cd /tmp/mdview-harness
cat > index.html <<'EOF'
<!doctype html>
<html><body style="margin:0">
<iframe id="f" src="http://127.0.0.1:7331/?file=showcase.md&embed=vscode"
        style="width:100vw;height:100vh;border:0"></iframe>
<script>
document.getElementById('f').addEventListener('load', () => {
  setTimeout(() => {
    document.getElementById('f').contentWindow.postMessage(
      { type: 'mdview/init', webviewPort: 7331 },
      'http://127.0.0.1:7331'
    );
  }, 100);
});
</script>
</body></html>
EOF
python3 -m http.server 8000
# open http://localhost:8000/ in a browser
```

- The iframe loads `showcase.md` rendered by mdview.
- **The left-hand file-tree pane is hidden** — only content + outline are visible.
- DevTools → Console (iframe context): `window.parent === window` → `false`; `new URLSearchParams(location.search).get('embed')` → `'vscode'`.
- (Stream B will exercise the postMessage routing for internal-link / outline-heading clicks; the harness only sends the `mdview/init` handshake.)

### 32. Friendly hostname + Host guard

```bash
node bin/mdview.mjs --no-open --port 7399 ./test-fixtures
```

- Startup line reads `mdview → http://mdview.localhost:7399/` (not `127.0.0.1`).
- Open that URL in **Chrome** *and* in **Safari** → both load the SPA. This is the
  one that needs a real browser: the name resolves to `::1` before `127.0.0.1`
  and mdview binds IPv4 only, so the browser must fall back. A visible stall
  before content appears means the fallback is costing real time — say so.
- Sub-domains work too: `http://docs.mdview.localhost:7399/` loads the same page.
- `curl -s -o /dev/null -w '%{http_code}' -H 'Host: not-loopback.test' http://127.0.0.1:7399/`
  → `403`, body exactly `Forbidden`. Repeat against `/api/tree`,
  `/api/file?path=showcase.md`, `/__asset/assets/star.svg` and `/api/watch` → all `403`.
- `PORT=7412 node bin/mdview.mjs --no-open ./test-fixtures` → binds 7412.
  `PORT=nonsense …` → falls back to 7331, no error.
- `mdview --vscode --port 0 ./test-fixtures` → ready JSON still says
  `http://127.0.0.1:<port>/`, **never** the friendly host (the extension
  validates that prefix).

### 33. Background server: the shell comes back

```bash
mdview stop            # start from nothing
mdview ./test-fixtures
```

- The prompt returns **immediately** (well under a second) and the browser opens.
- `mdview ls` → the folder, marked `●` and `(primary)`, plus a `server:` line with a pid and the `logs:` path.
- `ps` shows exactly one `mdview.mjs --daemon` process.
- Close the terminal entirely, open a new one → the page still loads, `mdview ls` still reports the same pid.

### 34. A second, unrelated folder joins the same server

```bash
cd /some/other/repo && mdview .
```

- Prints a URL on the **same port** as before, ending `?root=<name>`.
- `mdview ls` lists both folders and the **same pid** — no second server.
- In the tab that was already open, the new folder appears in the sidebar **without a reload** (the SSE `workspace` event).
- Sidebar: each folder is a heading, expanded, in the order they were added. With only one folder open its files sit at the top level with no wrapper — check both states.
- `⌘P` lists files from both folders, each prefixed with its folder name; typing a folder name narrows to it.
- `⇧⌘F` for a word present in both → results grouped, each labelled with its folder.
- Edit a file in the **second** folder → only that file reloads; the first folder's view and scroll position are untouched.
- Images and internal `[links](x.md)` still resolve inside their own folder.

### 35. Removing folders and stopping

- `mdview rm <name>` → the folder disappears from the open tab on its own. `mdview ls` no longer lists it.
- `mdview rm` the last folder → sidebar and main pane both show "No folders open", not an endless loading skeleton.
- `mdview rm nope` → `Not open: nope`, exit code non-zero.
- `mdview stop` → `mdview: stopped (pid N)`; the port is closed. `mdview stop` again → `mdview: not running`.
- After `stop`, `mdview ls` still lists the folders (they persist) and says the server is not running.

### 36. Failure and edge paths

- `mdview .` twice in the same folder → second says `open:` not `added:`, and `mdview ls` shows one entry.
- `mdview ./docs/guide.md` where `.` is already open → reuses that folder (`open:`), URL is `?file=<folder>/docs/guide.md`, **no** duplicate folder appears.
- `kill -9 <pid>` then `mdview .` → detects the stale `daemon.json`, starts a fresh server, folders all still there.
- Run `mdview .` in four terminals at once from a cold start → one server, four identical URLs.
- Open 9 folders → the 9th fails with `Workspace is full (8)`.
- `mdview --no-open .`, then leave it with no tab open for a few minutes → still running. Idle shutdown is off unless asked for.
- `MDVIEW_IDLE_TIMEOUT=0.05 mdview --no-open .` with no tab open → gone within ~5s; `daemon.json` removed. Repeat with a tab connected → stays up past the timeout.
- `PORT=7412 mdview .` → server on 7412.
- Hand-edit `workspace.json` into invalid JSON → next `mdview ls` reports no folders instead of crashing.

### 37. Regressions the daemon must not cause

- `mdview --foreground --no-open ./test-fixtures` → blocks, prints `watching:`, Ctrl-C stops it. Writes **no** `daemon.json`; `/api/health` 404s.
- `mdview --port 9000 ./test-fixtures` and `mdview --palette kanagawa ./test-fixtures` → both block in the terminal, exactly as before the daemon existed.
- `mdview --vscode --port 0 ./test-fixtures` → still one JSON line with a `http://127.0.0.1:<port>/` URL, still exits on stdin close.

## Tests

```bash
npm test            # vitest unit tests (count in docs/CONTRIBUTING.md)
npm run typecheck   # both tsconfigs clean
```

## Known follow-ups

See [`TODO.md`](TODO.md) for the phase 3 (workspaces) and phase 4 (editor extensions) roadmap.
