# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Removed
- **Node 20 is no longer supported; mdview now needs Node 22.12 or later.** Node 20 reached end of life on 2026-04-30, and a fresh install of 0.10.0 already failed to start a server on Node 20.0–20.18: `@fastify/static` 10.1.7 pulls `content-disposition` 3, which ships ES modules only, and Node loads those through `require()` without a flag only from 22.12. Run `node --version` before upgrading. The VS Code extension now needs VS Code 1.101 or later, the first release that runs on Node 22.

### Security
- **KaTeX is updated to 0.19, which fixes a prototype-pollution advisory** that could bypass its `trust` restrictions. KaTeX ships inside the client bundle, so `npm audit --omit=dev` never reported it.
- **A markdown file can no longer run script through an SVG beside it.** A document could frame `/__asset/…/evil.svg`, or link to it, and the SVG's script ran with no policy and could read other files and send them off the machine. Every `/__asset/*` response and every SVG response now carries a sandbox CSP, `nosniff` and `Cross-Origin-Resource-Policy: same-origin`, including when the route is reached through a percent-encoded URL. The page policy adds `frame-src 'none'` and `object-src 'none'`.
- **Symlinks can no longer lead out of an open folder.** A link committed into a repo (`notes.md -> /etc/hosts`, `logo.png -> ~/.ssh/id_ed25519`) was served as if it lived in the folder. Paths are now checked again after resolving every link. Links that stay inside the folder still work.
- **A regex folder search can no longer freeze the server.** A backtracking pattern could block every request for minutes. Regex search now runs in a worker thread that is stopped after 3 s, and the panel shows what it found so far. At most two searches run at once; the rest wait their turn.
- **`.txt` and `.pdf` are no longer served as assets, and nothing under a dot-folder is.** Only image, video and audio types are served.
- **The file watcher no longer follows symlinks**, so a repo holding `link -> /` no longer walks the whole disk.
- **`~/.config/mdview` is now private to your user.** The folder is `0700` and its files `0600`, and existing ones are tightened. They list every folder you have opened.
- **A link with `%22` in its path can no longer add attributes to the page.**
- **Front matter is now also bounded by characters.** Aliases to one long string stayed under the 10,000-node limit but expanded to about 100 MB; over 1,000,000 characters is now treated as plain text.
- **VS Code preview:** the webview now forwards only the extension's own messages into the preview.
- - **Shipped dependencies are updated to clear advisories:** `markdown-it` 14.3.2 → 15.0.3 (quadratic-time parsing of inline HTML when `html` is enabled, of a multi-line link reference definition, and further quadratic paths fixed in 15.0.1–15.0.3), `fastify` 5.12.5 → 5.12.7 (header validation bypass via case-sensitive `propertyNames`), and `fast-uri` 3.1.8 → 3.1.9 and 4.2.1 → 4.2.3 (scheme spoofing, path equivalence and host confusion in URI handling). The `markdown-it` ones were reachable: the renderer enables `html`, so a crafted markdown file could block the server. The others were not reachable as mdview is configured (no route declares a schema), but they ship in the install. `shiki` 4, `js-yaml` 5 and `open` 11 are also taken.

### Changed
- **`mdview --version`, `ls`, `rm` and `stop` start about five times faster.** They took about 0.2 s because every command loaded the web server, syntax highlighter and file watcher first; they now take about 0.04 s. The server code loads only when a command starts one.
- **The first document opens faster** (about 250 ms → 80 ms for a page of code). The syntax highlighter warms up right after the server starts listening and loads only the default palette's themes up front. Other palettes load the first time you pick them.
- **Live reload no longer re-highlights unchanged code blocks.** Highlighted blocks are cached (up to 8 MB, keys included, since a key holds the language name from the file), so saving a document with many large code blocks re-renders only what changed.
- **Folder search is faster.** Files are read eight at a time and kept in a cache that the file watcher keeps current: a repeated search over 4,000 files drops from about 1 s to about 70 ms. A search stops when you change the query.
- **The package is about 43% smaller (1.4 MB → 0.8 MB).** JetBrains Mono and KaTeX now ship as woff2 only, which every supported browser already used.
- **Markdown files over 16 MB are no longer rendered or searched.** Rendering is synchronous, so one huge file stalled every other request.
- **A single-file target that is itself a symlink is served from the folder its link points into.**
- **Front matter dates display as written** (`2024-01-02`) instead of as timestamps (`2024-01-02T00:00:00.000Z`). Front matter is now parsed as YAML 1.2 with merge keys (`<<: *defaults`) still applied.
- **Diagrams render with pele 1.10.** Labels and links in diagrams are sanitised more strictly (entity codes decode once; stray non-characters are stripped before the link scheme check), subgraph diagrams have fewer edge crossings, class diagrams wrap into rows instead of shrinking, CJK labels wrap, and `List<T>` in a label no longer renders as `List`. A `%%` comment no longer deletes the character before it, so a diagram that only parsed because of that now shows a syntax error.

### Fixed
- **A front matter block holding only whitespace or comments is still recognised as front matter** and removed from the page.
- **Navigating between files no longer drops and reopens the live-reload connection.** The watch stream reconnected on every navigation, so a file change could fall into the gap, and the server's connected-tab count briefly dropped to zero, which matters with `MDVIEW_IDLE_TIMEOUT`. One connection now lasts for the life of the page.
- **A burst of file changes no longer refetches the file tree hundreds of times.** Switching git branches fired one full tree request per added or removed file. Refreshes now wait 150 ms after the last change and run once, and the tree still ends up current.

## [0.10.0] — 2026-10-19

A security fix for front matter, and a lighter diagram renderer that follows
your palette. Upgrade if you open markdown you did not write: in 0.9.1 and
earlier, a file could run code on your machine.

### Security
- **Front matter is now parsed as YAML only.** Previously a file that began `---js` (or `---javascript`) had its front matter evaluated as JavaScript inside the server process when you opened it, so an untrusted `.md` file could run code on your machine. That path is gone.
- **YAML aliases can no longer expand a small front matter block into a huge response.** A few hundred bytes of nested aliases could produce hundreds of MB of JSON, or a cycle, and take the server down. The parsed front matter is now bounded at 10,000 nodes; a block over that is treated as plain text.
- **`gray-matter` is replaced by `js-yaml` 4.** This drops `js-yaml` 3, `argparse` 1 and `sprintf-js`, which `npm audit` flagged, so `npm audit --omit=dev` reports 0 vulnerabilities again.
- **`img-src` no longer allows `blob:`.** Only the old diagram output needed it.

### Changed
- **Only a bare `---` line opens front matter.** A `---js`, `---json` or `---yaml` opening line is now body text. A front matter block that is a list or a single value is still removed from the page, but shows no metadata.
- **Mermaid diagrams now render with pele instead of the mermaid library.** The lazy diagram code drops from about 899 kB to about 287 kB gzipped across all chunks, and a page loads only the diagram types it uses. Diagrams follow the active palette and light/dark through CSS variables, with no re-render on a switch. Diagrams look different, because pele has its own layout and visual style. A left-to-right flowchart too wide for the text column now switches to a top-down layout at full text size, where it used to shrink to fit.

### Fixed
- **External-link marking no longer breaks on SVG links.** An inline SVG anchor has read-only `target` and `rel` properties, so assigning them threw and stopped the marking of every later link. SVG anchors are now skipped.

## [0.9.1] — 2026-10-04

A file tree that keeps deep paths readable, and a dependency refresh.

### Fixed
- **File-tree indentation no longer grows with depth.** Each level added its own offset on top of its parent's, so the indent compounded: a file five folders down sat about 310 px in, past the edge of a default-width pane. Every level now adds one fixed 14 px step, so the same file sits under 90 px in.

### Changed
- **The file tree scrolls sideways**, like the Zed and VS Code sidebars. Long names are no longer truncated with an ellipsis; scroll the tree horizontally to read them instead of widening the pane. The "Files" header stays in place while the tree scrolls.

### Security
- Bumped shipped dependencies to clear advisories: `fastify` 5.12.3 → 5.12.5 (DoS via HTTP/2 trailer responses), `fast-uri` 3.1.6 → 3.1.8 and 4.1.4 → 4.2.1 (host confusion and authority injection in URI handling), `markdown-it` 14.2.0 → 14.3.2 (quadratic paths in `linkify`), and `brace-expansion` 5.0.9 → 5.0.12 (DoS on crafted brace patterns). The `markdown-it` one was reachable: the renderer enables `linkify`, so opening a few hundred KB of crafted markdown could block the server for tens of seconds. The others were not reachable as mdview is configured (the server does not enable HTTP/2), but they ship in the install. Lockfile-only change.

## [0.9.0] — 2026-09-14

Eight palettes, each with its own ground texture — and code blocks that are
smaller than they were at five.

### Added
- **Five new palettes: Everforest, Rosé Pine, Kanagawa, Catppuccin, and Flexoki** — each with a full light and dark variant and its own Shiki theme pair, so code blocks stay inside the palette. Base colours come from each project's own palette file; all six upstream projects are MIT.
- **Each palette now has its own ground texture.** Previously one texture was defined per light/dark theme, so a warm brown grain (`rgba(120, 70, 30, …)`) was washed over every palette including the cool ones. There are now three patterns, assigned per palette: a dot grain tinted with the palette's own ink on the paper-like palettes (flexoki, paper, solarized), fibre noise on the two lowest-contrast grounds (everforest, kanagawa), and an accent wash — a wide bleed of the palette's accent down from the top edge — on rose-pine and catppuccin. `high-contrast` gets none, because texture over a maximum-contrast ground works against the one thing that palette exists to provide. The noise is an SVG `feTurbulence` data URI, which the existing `img-src 'self' data: blob:` already permits, so the CSP is untouched.

  Texture is deliberately not a setting. It is part of a palette's identity, and a four-way picker crossed with eight palettes is 32 combinations nobody would author or test.
- **VS Code extension: two-way cursor sync.** Clicking a heading or an internal link in the preview moves the editor cursor and reveals the line; moving the cursor in the editor scrolls the preview to the nearest heading at or above that line, debounced at 80ms. A suppression window breaks the feedback loop so VS Code's own selection-change event isn't echoed back as a jitter loop. Inbound paths from the webview are canonicalized with `realpath` and rejected unless they stay inside the workspace folder. The extension is still unpublished (`0.1.0`).
- VS Code extension: `mdview: Open in Browser` command, and the preview now follows the active editor and the VS Code colour theme.

### Changed
- **Code blocks are rendered for the active palette only, and are far smaller for it.** Every token used to carry one CSS variable per (palette, mode) pair, so adding palettes inflated every document that contained code — 16 variables per token at eight palettes. A token now carries two, `--shiki-light` and `--shiki-dark`. `/api/file` accepts a `palette` query param, checked against the allow-list and falling back to the default rather than failing the request, and the client refetches when you change palette. The light/dark toggle still repaints with no request, since both its variants ship in every response. `test-fixtures/showcase.md` went from 204 KB to 30 KB — smaller than it was before any of the new palettes landed.
- **Flexoki is the new default palette**, replacing `classic`. It keeps the warm-cream editorial look but is built on a measured 15-step base ramp rather than hand-picked creams, and it is the only palette here designed for reading prose rather than for reading code.
- The VS Code extension's `auto` palette no longer picks a different palette for light and dark themes. Light versus dark is a separate axis in the renderer — every palette defines both — so `auto` now follows only the high-contrast kinds and otherwise leaves the palette alone.

### Removed
- **The `classic` and `nord` palettes.** `--palette classic` and `--palette nord` now exit non-zero and list the valid names. A `palette` of either in `.mdview.json` or a stale one in `localStorage` degrades silently to the default, which is the existing behaviour for any unrecognised palette — no migration needed.
- The VS Code extension drops both from the `mdview.palette` setting enum.

### Security
- `fastify` 5.8.5 → 5.12.3. Closes a schema-validation bypass via root primitive coercion (GHSA-w2qp-rph6-63g4) and `X-Forwarded-*` spoofing under `trustProxy` hop-count (GHSA-3m5p-2c4r-xxw2). Neither is reachable here — the server defines no root-primitive schemas and never sets `trustProxy` — but the dep ships to users.
- `js-yaml` 3.15.1 → 3.15.2 (transitively, via `gray-matter`). Closes unbounded CPU use on empty merge sources (GHSA-2883-xcg3-v3hh). This one is reachable: `js-yaml` parses frontmatter out of whatever markdown the user opens.

## [0.8.1] — 2026-08-24

### Fixed
- Live reload stopped working for any URL that named a file without its root id — a bookmark from before 0.8.0, or the VS Code extension sending a workspace-relative path. Such a request resolves against the primary root and the server answers with the workspace-scoped path, but the page kept comparing watch events against the path it had asked for, so nothing ever matched and the document silently stopped updating on save. The comparison now uses the path the server actually served. The first load always worked, which is why this got past the 0.8.0 checks.

## [0.8.0] — 2026-08-24

One background server, many folders. `mdview <path>` no longer holds the terminal.

### Added
- **`mdview <path>` returns the shell.** It starts one detached background server the first time it's needed; every later `mdview <path>`, in any repo, adds that folder to the same server and opens it. So unrelated folders — `~/work/api/docs` and `~/notes` — can be read side by side in one window at one stable URL. `--foreground` (`-f`) runs a server in the terminal as before.
- `mdview ls` (open folders, server pid/port, log path), `mdview rm <name|path>…` (stop serving a folder), `mdview stop` (stop the server).
- Folders persist in `~/.config/mdview/workspace.json` until removed, across restarts and reboots. Capped at 8, because each holds a live recursive watcher. Opening a file or subfolder inside an already-open folder reuses it instead of adding a duplicate.
- The background server runs until `mdview stop` or a reboot. `MDVIEW_IDLE_TIMEOUT` opts into having it exit after that many minutes with no browser tab connected (it clears its record, and the next `mdview` starts it again) — off by default, since a server that stays put keeps the URL reliable.
- `--port` and `--palette` now imply `--foreground`: each overrides a setting belonging to a whole server, and the background one is shared. A useful side effect is that every invocation that worked before behaves exactly as it did — only the bare `mdview [path]` form changed.
- The printed and opened URL is now `http://mdview.localhost:7331/` instead of `http://127.0.0.1:7331/`. `*.localhost` is reserved to loopback by RFC 6761 and resolves with no setup, no `/etc/hosts` entry and no privileges; the server still binds `127.0.0.1` only. If the local resolver doesn't answer the name with a loopback address the CLI falls back to the literal address rather than printing a URL that could leave the machine. `--vscode` keeps `127.0.0.1` unconditionally, because the extension validates that exact prefix.
- `PORT` is honoured as the default port when `--port` is omitted, so mdview runs unchanged under a local reverse proxy such as [portless](https://github.com/vercel-labs/portless) for a port-free URL. Invalid values are ignored rather than fatal.

### Changed
- **Paths in URLs are now workspace-scoped**: `?file=docs/api.md` becomes `?file=<rootId>/docs/api.md`, and asset URLs become `/__asset/<rootId>/<path>`. This is what lets one server host several unrelated folders at once. An unprefixed path still resolves against the first root, so existing links and existing bookmarks keep working, as does the VS Code extension.
- `/api/tree` now returns `{ roots, tree, config }`. With a single root its contents stay at the top level exactly as before; a second root is what introduces a folder node per root. Window-level settings (palette, font, line width) come from the first root; `ignore` stays per-root.
- Folder search covers every open folder root and labels each hit with its root. The 200-hit cap is a budget for the whole search rather than per root.
- With more than one folder open the sidebar groups each under its own heading, expanded by default. `⌘P` and folder search span every folder and show which one each result is in. Live reload learns a `workspace` event, so a folder opened or closed elsewhere appears in tabs that are already open without a reload. Closing the last folder shows an empty state rather than an endless skeleton.

### Security
- There is deliberately **no HTTP endpoint that changes which folders are served**. The CLI writes `workspace.json` and the server watches it, so adding a root requires filesystem access, which a web page does not have — nothing to CSRF, and no shared token to store or leak. `/api/health` is read-only and reports ids, a pid and a start time, never absolute paths.
- `mdview stop` checks the recorded pid **and** its start time against what the process reports before signalling it, so a recycled pid belonging to an unrelated process is never killed.
- State files are written `0600` inside a `0700` directory, each through a temp file and one rename so a reader never sees a half-written file. `workspace.json` is validated defensively on read: a hand-edited or truncated file degrades to fewer folders, never to a crash or an unchecked path.
- Concurrent `mdview` invocations are serialised through a lock file, so two shells can't race into two servers fighting over the port.
- Every request's `Host` header is now checked against a loopback allow-list (`localhost`, `*.localhost`, the loopback literals) in an `onRequest` hook, and anything else gets a bare `403`. Closes a DNS-rebinding hole: binding `127.0.0.1` never stopped a page the user was already browsing from re-resolving its own domain to loopback and reading every file mdview serves. Verified against a running server — `Host: evil.com` returned `200` before this change.
- `@fastify/static` 9 → 10 (major). Closes two high-severity advisories in the component that serves the SPA: authorization bypass via non-canonical URL paths (GHSA-8pvw-jcv7-9cmj) and route-guard bypass via path traversal (GHSA-83w8-p2f5-377r). The plugin is registered at a single call site with a `root` + `prefix` only, and v10 changes nothing we use — its diff against v9 is `fastify-plugin` ^5 → ^6 and `content-disposition` ^1 → ^2.
- Lockfile-only bumps clearing five further high-severity shipped-dep advisories: `brace-expansion` (DoS via unbounded expansion), `fast-uri` (host confusion via backslash authority delimiter), `find-my-way` (HTTP/2 DoS), `js-yaml` (quadratic CPU in `!!omap`), `linkify-it` (quadratic `mailto:` scan). `npm audit --omit=dev` is back to zero.
- The one remaining advisory is the `low`, dev-only `esbuild` one already deferred in 0.7.1: it is reachable only through `tsup`/`vite`, is absent from shipped deps, and never enters the published tarball. `npm audit fix` still cannot resolve it without a breaking parent bump.

## [0.7.1] — 2026-07-01

### Security
- Dependency security bumps applied via `npm audit fix` (lockfile-only, SemVer-compatible — no `package.json` range changes): `markdown-it`, `dompurify`, `linkify-it`, `js-yaml`, `ws`, and dev tooling. Clears all shipped-dep advisories (moderate/high DoS & complexity issues in the render path). One `low`, dev-only `esbuild` advisory (reachable solely through `tsup`'s Windows dev server, never in the published package) has no non-breaking fix and is knowingly deferred; the quality gate now audits shipped deps only (`npm audit --omit=dev`).

### Changed
- Under `--vscode`, the HTML response now **omits** the `frame-ancestors` CSP directive entirely (previously `frame-ancestors *`). Chromium 142 (shipped in VS Code 1.126) narrowed `frame-ancestors *` to match only network-scheme origins (`http`/`https`/`ws`/`wss`), which excludes the webview's non-network `vscode-webview:` parent — so `*` blocked the extension from framing the preview at all. No CSP value can name the dynamic webview origin, so the directive is dropped in embed mode; the loopback bind (`127.0.0.1`) remains the real network boundary. Default browser runs still emit `frame-ancestors 'none'` byte-for-byte.

### Fixed
- **Narrow-width layout.** The file-tree and outline panes now collapse into overlay drawers at narrow viewport widths instead of leaving blank, full-width grid columns that squeezed the document into an unreadable vertical sliver. Root cause: the pane-width CSS variables are set inline on `.app-shell` (needed for the drag-resizers), and inline styles overrode the responsive `@media` zeroing; the breakpoints now win via `!important`. Affects the plain browser CLI and the VS Code webview alike.
- **Embed mode** no longer reserves a blank left column for the (never-rendered) file tree, and the outline now opens correctly in the narrow VS Code preview instead of appearing empty.

## [0.7.0] — 2026-05-28

CLI prereqs for an upcoming VS Code extension. New, additive surface — browser-mode runs are unchanged.

### Added
- **`--vscode` flag** — opts the CLI into "embedded in VS Code" mode. Bundles four behaviors so the future extension has a single, named entry point: (1) relaxes the HTML response's `frame-ancestors` CSP directive (see **Security** below); (2) emits a structured one-line JSON ready signal on stdout (`{"event":"ready","url":"…","port":…}`) instead of the legacy two human lines; (3) implies `--no-open` (the extension owns the URL); (4) tells the SPA it is embedded so it can swap behaviors via the `?embed=vscode` query. Default browser invocations are unaffected; the flag must be passed explicitly.
- **`--palette <name>`** — override the palette for a single run without touching `.mdview.json`. Accepts `classic | paper | nord | solarized | high-contrast`. Invalid values are rejected at parse time with an explicit error listing the allowed set.
- **`--port 0`** — kernel-assigned ephemeral port. Previously the parser refused any port ≤ 0; now `0` is permitted and the actual bound port is read from `app.server.address()` after listen. Under `--vscode` the bound port is reported in the ready-signal JSON. Useful when the parent process (extension, CI) needs a free port without coordinating with mdview about ranges.
- **`data-source-line` on every rendered heading** (`<h1>` through `<h6>`) — 0-based file-line number including any frontmatter that was stripped. Enables future editor↔preview cursor sync. Additive attribute; harmless if unused.
- **SPA embed-mode** — when the SPA loads with `?embed=vscode` *and* is running inside an iframe (`window.parent !== window`), it activates a handshake-driven postMessage protocol with its parent (origin-validated, one-shot `parentOrigin` capture, message-type allow-list), hides the left-hand file-tree pane (VS Code's Explorer already provides one), and routes internal-link clicks and outline-heading clicks back to the parent via `mdview/internal-link-clicked` / `mdview/heading-clicked` messages instead of navigating in-page. The `?embed=vscode` query is preserved across all SPA-internal navigation.

### Security
- **`frame-ancestors` relaxed to `*` *only* when `--vscode` is passed.** Default browser runs still emit `frame-ancestors 'none'` byte-for-byte. All other CSP directives (`default-src 'self'`, `script-src 'self'`, `style-src 'self' 'unsafe-inline'`, `img-src 'self' data: blob:`, `font-src 'self' data:`, `connect-src 'self'`, `base-uri 'none'`, `form-action 'none'`) are unchanged in both modes — a regression test in `tests/server/embed-mode.test.ts` enforces this. Justification: the loopback bind (`127.0.0.1`) is the real network-layer boundary; `frame-ancestors` is defense-in-depth on top. Enumerating VS Code webview origins (which vary across desktop, web, and Codespaces) is brittle and not portable; `frame-ancestors *` gated by the explicit `--vscode` flag is the conservative middle ground.

### Changed
- Under `--vscode`, stdout emits a single line of JSON (`{"event":"ready",…}`) rather than the legacy `mdview → <url>` and `watching: <root>` human lines. Default mode is unchanged.

### Fixed
- `npm install -g` no longer silently no-ops on certain platforms. The new "only run `main()` when invoked as the entry point" guard now resolves symlinks (via `realpathSync`) on both sides of the comparison, so a globally-installed mdview (which lives behind a symlink in the global bin directory) still runs as expected.
- `data-source-line` line counts are robust across CRLF-authored sources and frontmatter blocks with trailing blank lines — computed directly from `raw` via a line-walk rather than relying on `gray-matter`'s internal byte representation.

## [0.6.2] — 2026-05-19

### Fixed
- **Mermaid diagrams now follow the active theme.** They were locked to the light palette (`theme: 'default'`), so on dark mode the text and edges were rendered as dark ink on the dark page background and were unreadable. The loader now reads `themeSignal`, re-initializes mermaid with `dark` / `default` to match, and re-renders existing diagrams on theme toggle (clearing the per-block render guard).
- **Mermaid syntax errors no longer dump a giant "Syntax error in text" diagram into the page.** On a bad diagram, mermaid's built-in fallback SVG (with the bomb-on-cream-background motif) could leak out of the block onto the page and break the layout when scrolling. Diagrams are now `parse`'d with `suppressErrors: true` first; failures render a compact `<pre class="mermaid-error">` inside the block, and any temp DOM nodes mermaid appended to `document.body` are cleaned up.
- **Live-reload SSE stops working after long sessions or many tab reloads.** A suspended browser tab or dropped network could leave the OS socket in a state where Node never fired `close`, so the per-connection listener on the watcher emitter was never removed. Every subsequent file save then fanned out into a dead pipe, and Node's default `MaxListenersExceededWarning` triggered at 10. The server process kept running (CLI still showed it up), but no new file change reached the browser and reloads appeared to hang. SSE writes now treat any failure as a hard disconnect and run a single cleanup path; the watcher emitter no longer caps its listener count at Node's default of 10.

## [0.6.1] — 2026-05-18

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
