# Architecture

A practical overview for someone (human or agent) about to read or extend the codebase.

## High-level shape

`mdview` is a **local CLI** that boots a **Fastify HTTP server** and opens the browser to a **Preact single-page app**. The server renders markdown to HTML on the fly and pushes file-change events through Server-Sent Events. The SPA fetches rendered files via a JSON API and refreshes content in place when SSE events arrive — preserving scroll/outline state.

```
┌──────────┐                         ┌────────────────────────┐
│   CLI    │  spawns                 │   Fastify HTTP server  │
│ src/cli  │ ───────────────────────▶│  src/server/index.ts   │
└──────────┘                         └────────┬───────────────┘
                                              │
                                              │ serves
                                              ▼
                                     ┌────────────────────────┐
                                     │  Browser (Preact SPA)  │
                                     │  src/client/main.tsx   │
                                     └────────────────────────┘
                                              │
                                              │ fetch /api/file → JSON
                                              │ fetch /api/tree → JSON (incl. project config)
                                              │ fetch /api/search → JSON
                                              │ subscribe /api/watch (SSE)
                                              ▼
                                     ┌────────────────────────┐
                                     │  3-pane reading view   │
                                     └────────────────────────┘
```

The server stays running for the lifetime of one CLI invocation. Killing the process tears everything down.

## Repo layout

```
build/
└── vite-woff2-only.ts               ← Vite plugin: @font-face sources reduced to woff2
src/
├── cli.ts                          ← CLI entry, args, port fallback, graceful shutdown; loads the server on demand
├── cli-config.ts / cli-workspace.ts ← `config` and `ls` / `rm` / `stop` subcommands
├── cli-update.ts                    ← `mdview update`: fetch, compare, print the install command
├── version.ts                       ← readVersion, the one source of the package version
├── update/                          ← semver.ts (strict parse/compare), latest.ts (hardened registry fetch), cache.ts (update-check.json), notice.ts (CLI stderr line)
├── daemon/                          ← background-server state, workspace file, CLI-side client, update-check.ts (daily check loop)
├── shared/                          ← cross-runtime modules (no Node-only or DOM-only deps)
│   ├── types.ts
│   ├── search-pattern.ts            ← compilePattern (case/word/regex) used by client + server
│   ├── relative-time.ts             ← formatRelativeTime (Updated N ago)
│   ├── ignore.ts                    ← DEFAULT_IGNORED_DIRS (client tooltip + server)
│   └── tree-utils.ts                ← MD_EXT, flattenMdRelPaths
├── render/                          ← pure server-agnostic markdown render pipeline
│   ├── markdown.ts
│   ├── shiki.ts                     ← highlighter, per-palette themes, warm-up, highlight cache
│   ├── byte-lru.ts                  ← size-capped LRU behind the highlight cache
│   ├── frontmatter.ts
│   ├── outline.ts
│   ├── links.ts                     ← tagInternalLinks, rewriteImageSrc
│   ├── html-tags.ts                 ← linear tag scanner (rewriteTags), stripMetaAndBase
│   └── math.ts                      ← KaTeX placeholder emission
├── server/
│   ├── index.ts                     ← createServer factory + .mdview.json watcher
│   ├── config.ts                    ← loadEffectiveConfig (global + project), mergeConfigs, validateConfig
│   ├── config-write.ts              ← `mdview config ignore` writer
│   ├── hosts.ts                     ← isAllowedHost
│   ├── workspace.ts                 ← open roots, parseWorkspacePath
│   ├── routes/
│   │   ├── api-file.ts              ← GET /api/file
│   │   ├── api-tree.ts              ← GET /api/tree (incl. project config)
│   │   ├── api-asset.ts             ← GET /__asset/*
│   │   ├── api-search.ts            ← GET /api/search (folder grep)
│   │   └── sse.ts                   ← GET /api/watch
│   ├── fs/
│   │   ├── resolve.ts               ← resolveSafePath (security boundary!)
│   │   ├── ignore.ts                ← DEFAULT_IGNORED_DIRS + isPathIgnored (shared with watcher + walkFolder)
│   │   ├── tree.ts                  ← walkFolder
│   │   ├── limiter.ts               ← weighted FIFO semaphore (search slots, read budget)
│   │   └── grep.ts                  ← folder-wide search backend
│   └── watcher.ts                   ← chokidar wrapper + emitSynthetic for config events
└── client/
    ├── main.tsx                     ← Preact mount + JetBrains Mono CSS
    ├── App.tsx                      ← top-level orchestration (slim — most logic in hooks)
    ├── shortcuts.ts                 ← single-source-of-truth keyboard shortcut registry
    ├── components/                  ← UI components (panes + overlays)
    ├── hooks/                       ← signals + effects (use*.ts)
    ├── lib/                         ← DOM augmentation helpers (wire*.ts) + pure utils
    └── styles/                      ← reset / theme / layout / content / components

tests/
├── server/                          ← vitest unit tests (markdown, math, grep, config, …)
└── client/                          ← persisted-signal, scroll-spy, outline-nav, search-pattern, …

apps/
└── vscode/                          ← VS Code extension; separate package, own deps + test runner
```

`apps/vscode` is a side-by-side package, not a workspace member — it consumes the
published `@hardikg/mdview` and talks to it across a process boundary (spawn +
ready-JSON on stdout + a webview iframe + `postMessage`). The root quality gate
does not cover it.

## Server (`src/server/`)

### Entry & boot

- **`src/cli.ts`** — argument parser, port-fallback listener, browser launcher, SIGINT/SIGTERM shutdown with timeout, friendly error messages (port-in-use, ENOENT, EACCES). `MDVIEW_DEBUG=1` enables full stack traces. fastify, chokidar, `open` and the render pipeline load with `import()` only in the commands that start a server or open a browser, so `--version`, `ls`, `rm` and `stop` skip them. After `listen`, `warmHighlighter()` runs in the background, so the first document finds Shiki ready.
- **`src/server/index.ts`** — `createServer({ roots, clientDir, … })` factory. Opens one `RootState` per root, composes routes over the root list, registers `@fastify/static` for the bundled SPA at `/`, hooks `onClose` to close every watcher. Boots a **second chokidar watcher per root** dedicated to that root's `.mdview.json`, because the main watcher's `ignored` filter excludes dotfiles.

### The background server (`src/daemon/`, `src/cli.ts`)

`mdview <path>` does not run a server. It registers the folder, makes sure a
detached one is running, opens the browser and exits — so the shell comes back
immediately and one process serves every folder you ever open.

| Module | Role |
|---|---|
| `daemon/state.ts` | Where state lives (`~/.config/mdview/`), and `daemon.json` — pid, port, start time. Atomic writes (temp file + rename), `0600` in a `0700` dir. Also the spawn lock. |
| `daemon/workspace-file.ts` | `workspace.json`: the open folders, their persisted ids, add/remove, the 8-root cap, and defensive validation on read. |
| `daemon/client.ts` | The CLI's side: probe `/api/health`, decide whether the recorded daemon is really ours, spawn one under the lock (replacing one on a different version), wait for a root to appear, stop one. |
| `daemon/update-check.ts` | The opt-in daily registry check, run inside the daemon. Polls hourly, re-reads the global config each time, fetches only when enabled and the cache is a day old, and records the answer in `update-check.json`. Failures go to `daemon.log` only. |
| `update/` | `semver.ts` is the strict version parser every outside version string passes through. `latest.ts` is the only code that opens a network connection. `cache.ts` reads and writes `update-check.json` (`0600`, atomic, re-validated on read). `notice.ts` decides whether the CLI prints its one line. |
| `cli-workspace.ts` | `ls` / `rm` / `stop`, following the `cli-config.ts` subcommand pattern. |
| `cli.ts` | Three run modes: `runAttach` (default), `runForeground` (`--foreground`, `--port`, `--palette`, `--vscode`), `runDaemon` (`--daemon`, internal). |

**The workspace file is the control plane.** The CLI writes `workspace.json`; the
daemon chokidar-watches it and calls `setRoots`. This is a security decision as
much as a simple one: there is no HTTP endpoint that mutates anything, so there
is no CSRF surface to defend, no shared token to store, and none to leak. A page
in the user's browser cannot write files; their shell can.

**Identity, not just a pid.** `daemon.json` records the start time alongside the
pid, and `/api/health` reports both. The CLI treats a daemon as its own only when
both match. Pids get recycled, so a stale record can name a live process that has
nothing to do with mdview — and `mdview stop` must never signal that one.

**A daemon on another version is replaced.** `/api/health` also reports the
package `version`. After `npm i -g` the old daemon would keep serving old code,
so a security fix would not take effect until the user ran `mdview stop`. When
`ensureDaemon` finds a verified live daemon whose version differs from the CLI's
(or is missing: 0.10.0 and older report none), it takes the spawn lock and looks
again, because a rival may have finished the swap. It then stops the daemon
through `stopDaemon` (the same pid-plus-`startedAt` check, so a recycled pid is
never signalled), spawns a new one and prints
`mdview: restarted the background server (old → new)` on stderr. The open folders
live in `workspace.json`, which the new daemon reads at boot, so nothing is lost.
A CLI that loses the lock waits for a daemon other than the one being replaced,
never for the old one. Only the attach path acts: `ls` reports the mismatch,
`stop` just stops, `rm` only edits the workspace file, and `--foreground` and
`--vscode` have no daemon. Two installs on different versions take turns
replacing each other's daemon, each time with the line above, so the flapping is
visible and not silent.

**One daemon, not several.** Two shells running `mdview` at the same moment would
otherwise both spawn. The spawn is serialised through an `openSync(…, 'wx')` lock
file, with a staleness window so a crash mid-spawn doesn't wedge later runs.

**Idle shutdown, opt-in.** The SSE route reports its connected-client count; at
zero the daemon arms a timer and exits when it fires, clearing `daemon.json`.
`MDVIEW_IDLE_TIMEOUT` (minutes) turns this on; it is off by default, because a
shared server that stays put is more predictable than one that vanishes on a
timer, and `mdview stop` already exists. What it guards against is the recursive
watcher each open folder holds — which the 8-folder cap is the other half of.

**Ordering.** `runAttach` registers the root *before* ensuring the daemon, so a
daemon it starts already has the folder at boot and a running one picks it up from
the watcher. It then polls `/api/health` until the root id appears, because
otherwise the browser can open a deep link before the root it names exists.

### Workspace (`src/server/workspace.ts`)

The server serves **N folders at once**, not one. Each is a `RootState`: its wire
identity (`WorkspaceRoot`), its absolute path, its own frozen ignore set, its own
`.mdview.json`, and its own chokidar watcher.

Every path on the wire is **workspace-scoped**: `<rootId>/<path within the root>`.
That is the whole design decision. A relPath stays a single opaque string, so
`TreeNode`, `RenderedFile`, `WatchEvent`, `?file=`, `/__asset/*`, permalinks and
every client hook keep working untouched — the alternative, threading a separate
`root` parameter through all of them, is the same feature for several times the
diff.

`parseWorkspacePath(roots, wsPath)` splits the first segment and looks it up in
the open-root set. It is a **lookup, not a parser**: an id that isn't open cannot
select anything. When the first segment isn't a known id, the whole string is
taken as relative to the primary root — which is what keeps pre-workspace
`?file=` links and the VS Code extension (both of which send bare root-relative
paths) working. It does no containment checking itself; the remainder is still
untrusted and every caller hands it to `resolveSafePath` against that root's
absolute path.

Root ids are assigned once, from the folder basename, disambiguated against ids
already in use (`docs`, `docs-2`), and then **persisted by the caller** — so
opening or closing an unrelated root never renumbers an existing one and
permalinks survive.

`WorkspaceRoot` deliberately carries no absolute path. The SPA has no use for
one, and anything that can reach the port would otherwise be handed a map of the
user's disk.

Window-level settings (palette, font, line width) can only have one value, so
they come from the **primary** (first) root's config. `ignore` is per-root,
applied in that root's own walk and watcher.

### Routes (`src/server/routes/`)

| Route | Purpose |
|-------|---------|
| `GET /api/file?path=...` | `path` is workspace-scoped (`<rootId>/<path>`). Read the file, parse frontmatter, render to HTML, extract outline, tag internal links, rewrite image src. Returns a `RenderedFile` (incl. `lastModified` mtime). |
| `GET /api/tree` | Walk every open root; return `{ roots, tree, config }`. With one root its contents sit at the top level, exactly as before workspaces existed; with several, each root is a top-level folder node whose `relPath` is its bare id. `config` comes from the primary root. |
| `GET /api/search?q=...&case=...&word=...&regex=...` | Grep across every folder root; hits come back root-qualified. Caps per-file (20) and global (200) — the global cap is a budget for the whole search, not per root. Lines over 10,000 characters are skipped in both modes, and a literal search stops after 1 s of matching; either sets `truncated`. At most two searches run at once across the server; later ones wait, and one whose client goes away leaves the queue. Single-file roots are skipped. Returns `{ query, results, truncated, timedOut }`; `timedOut` means a regex search hit its time budget and `results` is partial. |
| `GET /api/watch` | One Server-Sent Events stream carrying every root's `WatchEvent`s, with root-scoped `relPath`s. Includes a synthetic `config` event when a root's `.mdview.json` changes, and a `workspace` event when the set of open roots changes. |
| `GET /__asset/*` | Serve user content assets (images, etc.). The splat is workspace-scoped, so the URL shape is unchanged: `/__asset/<rootId>/<path>`. Resolved via `parseWorkspacePath` then `resolveSafePath`. A single-file root serves only what its document references. |
| `GET /api/health` | Registered only when `createServer` is given an `identity` (i.e. in daemon mode). Reports `{ok, pid, startedAt, version, roots: [id]}` — ids only, never absolute paths. |
| `GET /*` | Falls through to the static SPA bundle; SPA fallback for unknown routes (so client routing works on refresh). |

All request paths that touch the filesystem go through `resolveSafePath(rootAbsPath, rel)` — see `src/server/fs/resolve.ts` — which rejects absolute paths and traversal attempts.

### Rendering pipeline (`src/render/`)

The renderer lives in `src/render/`, **outside** `src/server/`, because it has no Node-only or HTTP-specific code. It can run from any context (server route, future editor extension, tests). Each request to `/api/file` runs through this pipeline in order:

1. **`frontmatter.ts`** — `parseFrontmatter(raw)` peels off `---`-delimited YAML using `js-yaml` (YAML 1.2 core schema plus merge keys). Front matter is YAML only: an opening line like `---js` is body text, and a budget of 10,000 nodes and 1,000,000 characters rejects alias bombs and cycles. It walks lines by offset and never splits the whole document; the blank lines after the closing `---` are dropped by the same walk, not a regex, so millions of them cannot overflow the stack. Returns `{ data, body, bodyStartLine }`.
2. **`markdown.ts`** — `renderMarkdown(body)` constructs a singleton `markdown-it` instance with `linkify`, `markdown-it-anchor` (custom slugify), `markdown-it-task-lists`, and the local **`mathPlugin`**. Walks the token list to intercept `fence` tokens: `mermaid` becomes a `<div class="mermaid-block" data-source="...">` that the client renders to SVG, everything else is highlighted via Shiki. The same walk runs `stripMetaAndBase` (`html-tags.ts`) over every `html_block` token and every `html_inline` child, which removes `<meta>` and `<base>` start tags from the document's raw HTML (see the security model).
3. **`shiki.ts`** — `highlightCode(code, lang, palette)` lazy-loads languages on demand. Only the default palette's theme pair loads at start-up; another palette's pair loads on its first request, and concurrent requests share that load. Results sit in an 8 MB `ByteLru` (keys count toward the cap) keyed by palette, language and the SHA-256 of the code, so a live reload re-highlights only blocks that changed. It renders the requested palette's light and dark themes with `defaultColor: false`, so each token carries exactly `--shiki-light` and `--shiki-dark` and the light/dark toggle repaints purely in CSS. Changing *palette* refetches, because only the active one is rendered: rendering all eight put 16 variables on every token and took a real document from 30 KB to 204 KB.
4. **`math.ts`** — markdown-it core rule that scans for `$$...$$` paragraphs and `$...$` inline runs (with whitespace heuristics and code-span exclusion), emitting `<span class="math-inline">` / `<div class="math-block">` placeholders with URL-encoded `data-source`.
5. **`outline.ts`** — `extractOutline(tokens)` walks heading tokens, builds a nested `OutlineNode[]` tree using a stack-based algorithm. Handles non-monotonic depth jumps (e.g. h1 → h3 with no h2).
6. **`links.ts`** — `tagInternalLinks(html, currentRelPath)` adds `data-internal-link="<resolved-path>"` to relative `.md` `<a href>`s so the client can intercept them. `rewriteImageSrc(html, currentRelPath)` rewrites relative `<img src>` to `/__asset/<resolved>` so they resolve against the content root, not the SPA bundle. Both run over the final HTML through `rewriteTags` (`html-tags.ts`), a single forward pass that reads tags the way an HTML tokenizer does: quoted attribute values may hold `>`, comments and the attributes of other tags are stepped over, attribute names match case-insensitively, and single-quoted or unquoted values are handled like double-quoted ones. Markdown links and raw-HTML anchors and images are rewritten alike.

### Filesystem (`src/server/fs/`)

- **`resolve.ts`** — `resolveSafePath(root, rel)` is the security boundary. Rejects absolute paths, normalizes the result, ensures it stays within `root`. Used by every fs read/write.
- **`tree.ts`** — `walkFolder(root, { ignore, relBase })` recursively walks the directory, skipping dotfiles and any directory whose basename is in the supplied ignore set (defaults to `DEFAULT_IGNORED_DIRS`). Sorts dirs first then alpha. Marks markdown files with `isMarkdown: true`. `relBase` prefixes the emitted relPaths with the root id — it affects the wire path only, never which directory is read.
- **`grep.ts`** — `grepFiles(roots, query, opts)` searches across roots. Reuses `walkFolder` + `flattenMdRelPaths` + the shared `compilePattern`. Walks each root unprefixed so paths stay resolvable against it, then prefixes on the way out. Caps per-file and global. Strips frontmatter before grepping. Every search, literal or regex, first takes one of two slots in `searchSlots` (a `Limiter` from `limiter.ts`, first come first served); later searches queue, and a queued search whose client goes away leaves the queue and returns empty. A search keeps up to 8 reads in flight ahead of the matcher while still reporting files in walk order, and skips files over 16 MB. Each read is charged by file size to `searchReadBudget`, one 32 MB byte budget shared by all searches, and holds it until the matcher is done with that body; files queue for it in walk order, so the file the matcher waits on is never stuck behind later ones. Front-matter-stripped bodies live in a `ContentCache` (32M characters, least-recently-used out first) keyed by path and checked against mtime and size; `createServer` also invalidates entries from watcher events. A cache hit costs no budget. The route aborts the search when the client closes the request. Both modes walk a body's lines by offset instead of splitting it, skip lines over 10,000 characters (`maxLineLen`), and count hits past the per-file cap without storing them. Literal matching runs on the main thread under a 1 s matching budget (`literalBudgetMs`) and hands the thread back every 10 ms of matching, even inside one file, checking for an abort each time; spending the budget ends the search with `truncated` set, not `timedOut`. Regex matching runs in `regex-worker.ts` (bundled to `bin/regex-worker.mjs`) through `regex-runner.ts`, which keeps one warm worker and terminates a worker at its search's time budget; the search slots bound how many workers run at once — see the security model.
- **`ignore.ts`** — `DEFAULT_IGNORED_DIRS` (re-exported from `src/shared/ignore.ts` so the client tooltip can list the same names), `buildIgnoreSet(extra)` to union user-supplied basenames into the defaults, and `isPathIgnored(abs, root, set)` for the chokidar `ignored` callback. Plain basename equality — no globs, no regex.

### Config (`src/server/config.ts`)

Two layered files: **global** at `~/.config/mdview/config.json` (or `$XDG_CONFIG_HOME/mdview/config.json` when set) and **per-project** at `<root>/.mdview.json`. Same schema. `loadEffectiveConfig(rootAbsPath)` loads both in parallel and merges via `mergeConfigs` — project wins for scalar fields, `ignore` is unioned and deduped. Validation rejects unknown keys silently, drops invalid values with a `console.warn`, and never throws. `ignore` entries must match `/^[A-Za-z0-9_.\-+]{1,64}$/` and are not allowed to be `.` or `..`. The validated config flows into the `/api/tree` response. Scalar fields hot-reload when the project file changes; the `ignore` set is frozen at startup because chokidar caches its `ignored` callback at construction time.

### Watcher (`src/server/watcher.ts`)

A thin `chokidar` wrapper. Accepts an `ignore` set wired through to chokidar's `ignored` callback via `isPathIgnored`. With `only` (a single-file root) it watches the folder at `depth: 0` and filters every entry but that one file: a direct watch on the file follows its inode, which an editor's write-temp-then-rename save replaces, while the folder sees the rename. The filter compares names exactly, and chokidar reports entries with their on-disk names under the folder path it was given, so `detectRoot` (`src/cli.ts`) and `resolveTarget` (`src/daemon/workspace-file.ts`) take the file name from `realpathSync.native`, which returns the on-disk case; on a case-insensitive disk `mdview readme.MD` still reloads when `README.md` changes. Emits `WatchEvent`s with forward-slash relative paths (regardless of host OS). Awaits write-finish so a single save doesn't fire a flurry of events. Catches `EMFILE`/`ENOSPC` on the chokidar error channel and prints a hint pointing at the global config file. Exposes `emitSynthetic(event)` so the dedicated `.mdview.json` watcher can push `config` events through the same SSE stream.

## Client (`src/client/`)

### Entry

- **`src/client/main.tsx`** — mounts `<App />` to `#app`, imports JetBrains Mono CSS (400 + 600), then CSS files in order: reset → theme (CSS vars + palettes) → layout (3-pane grid) → content (markdown typography) → components (everything else).
- **`src/client/App.tsx`** — top-level orchestration. Now slim; most logic delegated to hooks (`usePathRouting`, `useLiveReload`, `useScrollSpy`, `useTheme`, `usePalette`).

### State model — signals over useState

State is split between:
- **Module-scoped signals** for cross-component shared state (theme, file content, current heading, search open, etc.). Located in `src/client/hooks/use*.ts`.
- **Component-local `useState`** for transient component state (e.g. the search query as the user types).

Signals are preferred for shared state because they auto-subscribe at the JSX read site and trigger fine-grained re-renders without prop-drilling. They also avoid React-style state-update batching weirdness inside effects.

### Persisted state — `createPersistedSignal`

`src/client/lib/persisted-signal.ts` is the canonical helper for any signal that should survive reloads. Variants: `createPersistedBool`, `createPersistedNumber` (with min/max clamp), `createPersistedString` (with allowed-list). Used by `useUiState`, `useTheme`, `usePalette`, `useSearch` (option toggles), `useOutlineLevels`. Pattern:

```ts
const { signal, set } = createPersistedSignal('mdview-foo', defaultValue, { parse, serialize });
```

### Key signals

| Signal | File | Purpose |
|--------|------|---------|
| `themeSignal` | `useTheme.ts` | `'light' \| 'dark'` |
| `paletteSignal` | `usePalette.ts` | one of `PALETTES` (`src/shared/types.ts`); a change refetches the document |
| `fileSignal`, `fileLoading`, `fileError` | `useFile.ts` | Currently rendered file (incl. `lastModified`) |
| `treeSignal`, `configSignal` | `useTree.ts` | Folder tree + project config |
| `currentPathSignal` | `usePathRouting.ts` | Currently open file path |
| `mainScrollerSignal` | `useScroller.ts` | The `.pane-main` element ref (for shortcuts that need to scroll programmatically) |
| `activeHeadingId` | `useScrollSpy.ts` | **Topmost-passed** heading — drives outline highlight |
| `focusedHeadingId` | `useScrollSpy.ts` | Heading whose section holds the **top-third reading band** (35% from the viewport top) — drives focus mode (separate from `activeHeadingId`) |
| `treeCollapsedSignal`, `outlineCollapsedSignal`, `treeWidthSignal`, `outlineWidthSignal` | `useUiState.ts` | Sidebar collapse + width state |
| `focusModeSignal`, `minimapSignal`, `wideLayoutSignal` | `useUiState.ts` | Reading-mode toggles |
| `outlineLevelsSignal` | `useOutlineLevels.ts` | Set of heading levels visible in the outline |
| `searchOpenSignal`, `searchScopeSignal`, `searchCaseSensitiveSignal`, `searchWholeWordSignal`, `searchRegexSignal` | `useSearch.ts` | Search bar state |
| `paletteOpenSignal` | `useCommandPalette.ts` | ⌘P palette open |
| `lightboxSignal` | `useLightbox.ts` | Image lightbox `{ src, alt }` or null |
| `shortcutsPanelSignal` | `useShortcutsPanel.ts` | Help modal open |

### Components (`src/client/components/`)

- **`Header.tsx`** — brand, breadcrumbs, the View menu, the theme toggle and the shortcuts button. All controls have `data-tooltip` for the custom subtle tooltip.
- **`ViewMenu.tsx`** — the header gear menu: focus mode, minimap and wide-layout toggles, plus a swatch for each entry in `PALETTES`.
- **`FolderTree.tsx`** — collapsible recursive tree of `TreeNode`s.
- **`Resizer.tsx`** — pointer-driven drag handle between panes; uses `setPointerCapture` and a ref-stashed latest-props pattern to avoid teardown on every render.
- **`Content.tsx`** — renders the file's HTML via `innerHTML` (it's server-rendered trusted content) and runs the **wire pipeline** (see below). Hosts the focus-mode effect.
- **`Outline.tsx`** — renders the heading tree with depth indentation, scroll-spy active highlight, per-node collapse state, and the H1–H6 toggle pills filter.
- **`Breadcrumbs.tsx`** — renders the path from root to active heading.
- **`Minimap.tsx`** — sticky right-edge bar rail with viewport indicator.
- **`ReadingProgress.tsx`** — sticky bar at the bottom edge of the header.
- **`SearchBar.tsx`** — combined doc/folder search, scope pills, option toggles (Aa / ab / .*), folder-results panel.
- **`Lightbox.tsx`**, **`ShortcutsPanel.tsx`**, **`CommandPalette.tsx`** — overlay components, conditionally mounted from App based on signals.

### Wire pipeline (`src/client/lib/`)

After `Content.tsx` injects the server-rendered HTML, it runs `runWires(root, ctx, defaultWires)` from `lib/wire-pipeline.ts`. The default wires are listed in `lib/wires.ts`; adding a new behavior is a single entry, in one place.

| Wire | File | Effect |
|------|------|--------|
| `mermaid` | `mermaid-loader.ts` | Find `.mermaid-block` divs, dynamically `import('pele/lazy')` (loads only the diagram types in use), render each as SVG. Bundle never loaded if no diagrams exist. Colours come from CSS variables mapped from the palette tokens in `content.css`, so theme and palette switches need no re-render. Links are limited to `http`, `https` and `mailto`; images are off. |
| `math` | `katex-loader.ts` | Find `.math-inline` / `.math-block` placeholders, dynamically `import('katex')` + lazy-inject KaTeX CSS, render each. |
| `internal-links` | `link-router.ts` | Wires click handlers on `a[data-internal-link]` to navigate inside the SPA. |
| `copy-buttons` | `copy-buttons.ts` | Appends a hover-revealed "Copy" button to each `<pre>`. |
| `permalinks` | `permalinks.ts` | Appends a `#` anchor to each heading; click copies a deep-link URL. |
| `external-links` | `external-links.ts` | Detects `http(s)` links not tagged as internal; adds `target="_blank"`, `rel="noopener noreferrer"`, and an inline SVG `↗` icon. |
| `image-lightbox` | `image-lightbox.ts` | Wires click handlers on `<img>` elements to open the lightbox. |
| `collapsible-sections` | `collapsible-sections.ts` | Prepends a chevron `<button>` inside every top-level heading-with-id; clicking toggles `hidden` on its trailing siblings up to the next heading of equal-or-shallower level. State is module-scoped (`Set<string>` of collapsed ids), keyed on `currentPathSignal` so same-file live-reload preserves it and a file switch resets it. Exports `expandSectionContaining(id)` for anchor jumps and `expandAll` / `collapseAll` for the `e` / `⇧E` shortcuts. |

Each helper is **idempotent** (uses a marker class or dataset flag to skip already-processed nodes) and takes the root element. Don't add behavior to JSX components if it requires walking the rendered HTML — keep that in lib helpers.

### Two-headed scroll-spy

There are **two** "active heading" trackers, deliberately:

- **`useScrollSpy` → `activeHeadingId`**: the *topmost heading you've passed*. Drives the outline highlight + breadcrumb. Threshold = `scroll-margin-top: 16px` (matched in CSS) + 6 px tolerance for sub-pixel rounding. `lockScrollSpy(id, ms)` pins this for ~600 ms during programmatic smooth-scrolls so the outline doesn't flicker mid-jump.
- **`useScrollSpy` → `focusedHeadingId`**: the *most recent heading that has crossed the top-third reading band* (`FOCUS_BAND_FRACTION = 0.35` of the viewport height, measured from the top). Drives focus mode. Because the band sits below the viewport top, focus moves to a new section as soon as its title enters the reading zone, while `activeHeadingId` still waits for the heading to reach the top edge.

Both are computed by the same `useScrollSpy` effect (`pickActiveId` and `pickFocusedId`) from one cached heading list. Both use **bounding-rect deltas** (not `offsetTop`, which is relative to the nearest positioned ancestor and was misaligned with `scrollContainer.scrollTop`), cache the heading list, refresh via `ResizeObserver` on the scroller, and use `MutationObserver` on the **scroller (subtree)** — observing `.markdown-content` directly missed initial mount because `<Content>` is gated on file-loaded. Each signal gets a no-op-write guard to avoid notifying downstream effects when the result didn't change.

The MutationObserver also watches `attributes` with `attributeFilter: ['hidden']`. Collapsing a section toggles the `hidden` attribute on every trailing sibling of the folded heading — that collapses their layout boxes without producing any `childList` mutation, so without this extension the cached heading offsets would go stale after a fold and `pickActiveId` would highlight the wrong heading.

### Live reload (`useLiveReload.ts`)

Subscribes to `/api/watch` via `useSSE`. On `change` for the current file, snapshots `mainRef.current.scrollTop`, re-fetches `/api/file`, restores scroll. On `add` / `unlink` / `config` / `workspace`, re-fetches `/api/tree` (which carries the project config too).

`useSSE` opens one `EventSource` for the hook's lifetime and calls the newest handler through a ref. The handler changes on every navigation, so subscribing on handler identity would close and reopen the stream each time, drop events in the gap and briefly report zero connected clients to the server's idle timer.

Tree refetches go through `coalesce` (`lib/coalesce.ts`): a 150 ms trailing debounce plus an in-flight guard. A branch switch emits hundreds of `add` / `unlink` events, and each tree response carries the whole listing. Events that arrive during a fetch schedule exactly one follow-up, so the tree is always refreshed after the last event.

### Path routing (`usePathRouting.ts`)

Owns the URL ↔ `currentPathSignal` sync. Listens for `popstate` so browser back/forward keeps the SPA in step with the address bar. Exposes `navigate(relPath, hash?)`.

### Keyboard shortcuts (`src/client/shortcuts.ts`)

Single source of truth. Each entry is:

```ts
{
  id: 'next-heading',
  group: 'Navigation',
  label: 'Next heading',
  displayKeys: ['j'],
  whenTyping: 'block',
  match: (ev) => !meta(ev) && ev.key === 'j',
  run: (ctx) => nextHeading(ctx, 1),
}
```

`useKeyboardShortcuts.ts` is a tiny dispatcher that walks the registry per keydown; `ShortcutsPanel.tsx` reads the same registry and groups by `group` field. The `Esc` cascade (lightbox → palette → panel → search) stays inline in the dispatcher because its priority depends on signal state.

Sequence shortcuts (e.g. `gg`) use a module-scoped timestamp + `resetPendingSequences(ev)` called by the dispatcher.

## Build pipeline

- **`tsup`** bundles two entries with code splitting: `src/cli.ts` → `bin/mdview.mjs` and `src/server/fs/regex-worker.ts` → `bin/regex-worker.mjs`, plus shared `bin/*.mjs` chunks for the lazily loaded server. Splitting is what keeps the server's imports out of the entry file. `package.json` `files` ships `bin/*.mjs` (no source maps). `bin/` is gitignored; produced by `npm run build:server`. `prepack` empties `bin/` and rebuilds, so stale hashed chunks never ship.
- **Vite** builds the client SPA → `dist/client/` (HTML + hashed assets). `dist/` is gitignored; produced by `npm run build:client`.
- The server bundle imports `dist/client/index.html` at runtime (resolved relative to the binary's own location).
- `pele` (one chunk per diagram type), `katex` (+ its CSS) and JetBrains Mono subsets are split into separate chunks (lazy-loaded). `build/vite-woff2-only.ts` reduces every `@font-face` source list to its woff2 entry before Vite emits assets, so no `.woff` or `.ttf` file ships. Shiki runs on the server only, so no highlighter code or grammar ships to the browser.
- `prepare` script auto-runs `npm run build` if `bin/mdview.mjs` is missing, so `npm install -g github:user/repo` works without an explicit build step.

## Tests (`tests/`)

- **`tests/server/`** — vitest unit tests for every logic-heavy module (markdown, math, shiki, frontmatter, outline, resolve, tree, links, grep, config). Node env.
- **`tests/client/`** — persisted-signal, scroll-spy, outline-nav, outline-filter, search-pattern, relative-time, plus the SSE and live-reload hooks (mocked `EventSource`, rendered with `preact/test-utils`). happy-dom env.
- Current test count lives in `docs/CONTRIBUTING.md` (one place, so it can't drift). The VS Code extension carries its own suite in `apps/vscode/tests/unit/` under a separate vitest config — **not** run by the root `npm test`.
- UI components have **no automated tests** — verified via manual walks of `test-fixtures/` (`showcase.md`, `math.md`, `linked-doc.md`).

## Security model

- **Trust boundary:** the user owns the markdown content. Server-rendered HTML is injected via `innerHTML` because we trust what we ourselves rendered. Inline HTML inside markdown is also passed through (the user wrote it), except `<meta>` and `<base>` (below).
- **`<meta>` and `<base>` in raw HTML:** `renderMarkdown` removes both start tags from every `html_block` and `html_inline` token with `stripMetaAndBase` (`src/render/html-tags.ts`). A `<meta http-equiv="refresh">` navigates the whole tab once `Content.tsx` inserts it with `innerHTML`, and no CSP directive covers that, so a document could send the reader to any site. A client-side guard cannot help: the refresh is scheduled as the element is inserted. `<base>` is already blocked by `base-uri 'none'`; removing it as well is defence in depth. Raw HTML tokens are the only source of either tag, because markdown-it escapes `<` in text, code and attributes. The strip is context-free: a token is one piece of the page, so it cannot tell whether a `<meta` sits in text or inside another tag's quoted attribute, and it removes every `<meta` or `<base` followed by whitespace, `/`, `>` or the end of the token. A tag that never closes takes the rest of its token with it, and a `<` left in front of a cut becomes `&lt;`, so no tag name can form across the gap. `<metadata>` and `<basefont>` are kept.
- **Same machine:** the server listens on `127.0.0.1`, which keeps the network out but not other accounts on the same machine; any local process can connect. Browser routes carry no token outside embed mode, so bookmarks and pasted URLs keep working. Other origins in the browser still cannot read responses (no CORS headers), cannot rebind DNS onto the port (Host check), and cannot embed assets (CORP).
- **External boundary:** `resolveSafePath` is called on every filesystem read. Absolute paths and traversal are rejected. Containment is then checked again on real paths — `realpath` of both the root and the target — so a symlink committed into a repo (`notes.png -> ~/.ssh/id_ed25519`, `x.md -> /etc/hosts`) cannot lead out of the root; a link that stays inside still works. Callers read the real path it returns and check the extension on it as well as on the requested name. A missing target surfaces as `ENOENT` (404); an escape as `OutsideRootError` (400). A single-file root whose file is itself a link is opened at the link's target folder, so the file it names is inside its own root. `/api/file` refuses markdown over 16 MB with a 413 before reading it. With several roots open, `parseWorkspacePath` chooses *which* root's absolute path is the base — it is a lookup against the open set, so an unknown id can only fall back to the primary root, never widen the boundary. Note that percent-encoded `../` survives Fastify's router and arrives in a route param intact, so `resolveSafePath` is genuinely the only thing standing between it and the file; raw `../` is collapsed by the router first and 404s.
- **Front matter:** parsed as YAML only, by `parseFrontmatter`, with js-yaml's YAML 1.2 core schema plus merge keys. Only a literal `---` opening line starts front matter, so `---js` cannot select a code-evaluating engine. The loaded value is walked against a 10,000-node budget and a 1,000,000-character budget over every key and string it reaches (revisited shared references count again). The node budget bounds alias fan-out and cycles; the character budget bounds aliases to one long string, which stay under the node count but serialize to megabytes. An over-budget block is treated as a parse failure.
- **State directory:** `~/.config/mdview/` is owner-only. `ensurePrivateDir` (`src/daemon/state.ts`) creates it `0700` and chmods it if it already exists; `config.json`, `workspace.json`, `daemon.json`, `daemon.lock`, `daemon.log` and `update-check.json` are written `0600`, and existing files are tightened, because a mode passed at creation does not change an existing file. These files name every folder the user has opened. On Windows the modes are a no-op.
- **Outbound network:** the only code that opens a connection is `fetchLatestVersion` (`src/update/latest.ts`). It is reached from `mdview update` (run by the user) and from the daemon's opt-in daily check (`updateCheck: true` in the global config). `validateConfig` ignores that key in a `.mdview.json`, and `mergeConfigs` never copies it, so a cloned repo cannot turn it on and the browser never sees it. The request is a bare `GET` of one fixed `https://registry.npmjs.org/…/dist-tags` URL: no custom header, no body, no identifier, no cookie (Node's `fetch` keeps no jar). It uses `redirect: 'error'`, a 5 s timeout that also covers the body, and a stream read that stops at 64 KB. The answer is untrusted: it must parse as JSON, and its `latest` must match the strict semver pattern in `src/update/semver.ts` before it is compared, cached or printed, so no control character or escape sequence reaches the terminal. Errors never echo the response. `update-check.json` is re-validated on every read for the same reason. mdview never runs npm or any other process for an update. `mdview update` only prints a command, built from a version that passed the pattern and the quoted path of the `npm` beside the running Node.
- **Regex search:** a user's folder-search regex never runs on the main thread. One `exec()` of a backtracking pattern (`^(\w+\s?)*$` on a line of words ending in `!`) can run for minutes, and nothing interrupts a running `exec()` short of ending its thread. `grepFiles` sends file bodies in batches to a `worker_threads` worker and terminates it once the search's 3 s wall-clock budget is spent; the response keeps what was found before that and sets `timedOut` and `truncated`. Literal queries are escaped, cannot backtrack, and stay on the main thread, but any page the user visits can fire them through `<img src="http://127.0.0.1:…/api/search?q=a">`, so their work is bounded too: lines over 10,000 characters are skipped (one 15 MB line of `a` holds 15 million hits), hits past the per-file cap are only counted, lines are walked by offset rather than split into millions of strings, matching hands the thread back every 10 ms, and it stops after 1 s with `truncated` set. Each `*.localhost` name gets its own browser connection pool and passes the Host check, so a page can run many searches at once; all folder searches, literal and regex, therefore share two slots, and the file bodies they read share one 32 MB budget. With sixteen concurrent `q=a` searches over 72 MB of 9,999-character lines, other requests are answered within about 100 ms and memory stays under 500 MB. The in-document search in the client still runs the user's regex on the page's main thread; that is the user's own tab and input, so a slow pattern there only stalls the tab that typed it.
- **Single-file roots:** `mdview ~/README.md` serves the folder the file lives in, which can be `$HOME`. The root is scoped to the one document anyway. `/api/file` and the tree are pinned to the file; the watcher watches only it (see Watcher); and `/__asset/*` serves only the paths the document references. `api-file.ts` collects every `/__asset/` URL that appears anywhere in the final HTML of each render — `rewriteImageSrc`'s `<img>` sources, an explicit `/__asset/` URL in inline HTML (`<video>`, `<audio>`), or the same text in the body — unescaped, stripped of query and fragment, percent-decoded and normalised the way the route receives them, and stores them on `RootState.assetRefs`. A watcher event clears the set; the next render, or an asset request with no set, recomputes it. A reference this misreads only makes its asset 404. Every other check (containment, dot segments, media types) still applies to referenced paths.
- **Dot paths:** `/__asset/*` refuses any path with a segment starting with `.`, judged by `hasDotSegment` (`src/server/fs/resolve.ts`) on the requested path and on the real path relative to the real root. The second check catches an in-root link into `.git`, and on Windows an 8.3 short name (`GIT~1`) that names `.git` without a dot. `/api/file` does not apply it: it returns markdown only, other origins cannot read it, and a README may link to `.github/CONTRIBUTING.md`.
- **Watchers:** every chokidar watch (each root's tree watcher, each root's `.mdview.json` watcher, and the daemon's `workspace.json` watcher) sets `followSymlinks: false`. chokidar follows links by default, so a repo holding `link -> /` would otherwise have it walk and watch the whole disk.
- **External links:** `target="_blank"` is always paired with `rel="noopener noreferrer"`.
- **Rewritten link attributes:** `tagInternalLinks` (`src/render/links.ts`) unescapes the captured `href`, percent-decodes the path, and HTML-escapes both the new `href` and `data-internal-link` on the way out. The decode is what makes the escape necessary: `%22` becomes a raw quote. `rewriteImageSrc` escapes a quote that a single-quoted or unquoted `src` carried.
- **Linear passes over whole documents:** every pass over a whole document — link and image rewriting, the `<meta>`/`<base>` strip, front matter, folder-search line walks — is a single forward scan with `indexOf` and character checks, never a backtracking regex. A regex like `<a\s+([^>]*?)href="…` restarts at every `<a` and scans to the next `>`, so an HTML block of `<a ` with no `>` would be quadratic — about a minute of CPU for 1 MB, with the whole daemon stalled — and any rendered document can make the daemon render another one through `<img src="/api/file?path=…">`.
- **Clipboard:** writes only happen in user-initiated event handlers.
- **Project config:** `validateConfig` rejects `lineWidth` strings that don't match a tight character class (so untrusted CSS can't slip in via `.mdview.json`).
- The server binds to `127.0.0.1` only (never 0.0.0.0). Single-machine, single-user.
- **Host allow-list:** `isAllowedHost` (`src/server/hosts.ts`) runs in an `onRequest` hook and 403s anything whose `Host` isn't a loopback name. The bind address keeps other machines out; this keeps out the user's own browser acting for someone else. In a DNS-rebinding attack `evil.com` re-resolves to 127.0.0.1 and the attacker's page — still same-origin with `evil.com` — can read everything mdview serves; the `Host` header is what distinguishes that request from a real one. The port is intentionally not part of the check: a name on the list cannot resolve off this machine, so the port adds nothing, and requiring it would break a local proxy that forwards the original `Host`.

### Content-Security-Policy

`markdown-it` runs with `html: true`, so inline HTML in a document reaches the
page verbatim. The CSP is what keeps that from becoming script execution. It is
assembled in `buildCspHtml()` (`src/server/index.ts`) and applied by an `onSend`
hook to `text/html` responses, alongside `referrer-policy: no-referrer`.
`/__asset/*` responses get a different policy (below) and never this one.

Every response carries `x-content-type-options: nosniff` — HTML, JSON, errors
and assets alike — so the declared type is the only one a browser acts on. The
same `onSend` hook sets it; the SSE stream writes its headers straight to the
socket, past the hook, so `sse.ts` sets it there.

| Directive | Value | Why |
|---|---|---|
| `default-src` | `'self'` | Nothing off-origin loads. |
| `script-src` | `'self'` | No `'unsafe-inline'`, no CDN. This is why the FOUC-avoiding theme bootstrap is an external `public/bootstrap.js` rather than an inline `<script>`. |
| `style-src` | `'self' 'unsafe-inline'` | KaTeX and the diagram renderer set inline `style` attributes on the nodes they generate. |
| `img-src` | `'self' data:` | `data:` for inlined SVG. |
| `font-src` | `'self' data:` | JetBrains Mono subsets are same-origin; KaTeX inlines some faces. |
| `connect-src` | `'self'` | Confines `fetch` and the SSE stream to this origin. |
| `frame-src` / `object-src` | `'none'` | Nothing in the SPA frames or embeds a document. A same-origin `<iframe>` in a `.md` would otherwise load an `/__asset/*` SVG as a page of its own. |
| `base-uri` / `form-action` | `'none'` | No `<base>` hijack, no form posts anywhere. |
| `frame-ancestors` | `'none'`, **omitted** under `--vscode` | Blocks framing by default. Under `--vscode` the directive is dropped entirely rather than widened to `*`: Chromium 142 (VS Code 1.126) rejects the webview's `vscode-webview://` origin against a wildcard, so no value frames correctly. The embed token (below) is what keeps other origins out instead. |

Adding a `script-src` source, adding `'unsafe-inline'` to `script-src`, or
weakening `connect-src` are all regressions — see `CLAUDE.md` §3.1.

### Embed mode (`--vscode`)

The VS Code extension spawns the CLI with `--vscode` and frames the SPA in a
webview. With `frame-ancestors` omitted, any page could frame
`127.0.0.1:<port>/?embed=vscode` and talk to the SPA, so the server needs a
gate of its own: a **per-launch token**.

- `ServerHandle` (`apps/vscode/src/server/ServerHandle.ts`) generates 32 bytes
  from `crypto.randomBytes` for every spawn, base64url-encoded, and passes them in
  the `MDVIEW_EMBED_TOKEN` environment variable. Never argv: any local user can
  read another process's argv with `ps`. The extension runs on the workspace
  side (`extensionKind: workspace`), so under Remote, WSL and SSH the variable
  reaches the CLI on the same host as the files.
- The CLI refuses `--vscode` without a well-formed token, removes it from its
  own environment once read (nothing it spawns inherits it), and never prints
  it: the ready line carries only the URL and port.
- `createServer({ embedToken })` turns embed mode on. Every `text/html`
  response needs `?token=`; the `onSend` hook checks the response type rather
  than the path, so `/`, `/index.html` and the SPA fallback for any unknown path
  are all covered. Every `/api/*` request needs the `x-mdview-embed-token`
  header, or `?token=` for `EventSource`, which cannot send headers. The
  comparison is `crypto.timingSafeEqual` over equal-length buffers; a miss is a
  plain-text 403. `/__asset/*` and the static bundle stay open: `<img>` cannot
  carry a header, the bundle is public code, and CORP `same-origin` already stops
  another site from loading the user's assets.
- The token travels in the page URL. The extension puts it on the iframe `src`
  (`buildEmbedUrl`, `PreviewPanel.ts`); VS Code's webview proxy swaps only the
  origin of a localhost request and keeps the path and query. The SPA reads it
  once at boot (`embedToken()`, `src/client/lib/embed.ts`), sends it on every API
  call, and `pushPath` keeps it with `embed` so a reload after navigating still
  passes the gate. `Referrer-Policy: no-referrer` keeps it out of the `Referer`
  of any link the user follows, and permalinks copy only `?file=`.
- "Open in Browser" opens the same server in a normal tab, so its URL carries
  the token too, without `embed=vscode`.
- The SPA completes the `mdview/init` handshake only when the message comes from
  `window.parent` and its `token` equals the one in the page's boot URL. The
  extension sends the token in its init message.
- Every load of the frame is a new SPA document that needs its own init, and it
  cannot ask: before the handshake it does not know the parent's origin, and it
  never posts to `'*'`. So the relay in the webview host page
  (`apps/vscode/src/webview/host.html.ts`) posts `mdview/ready` to the extension
  on every iframe `load`, and `PreviewPanel` answers every `mdview/ready` with an
  init before the extension restores its file with `mdview/set-file`. This
  covers the first load, a reload of the frame, and a reload of the whole
  webview. The SPA also posts `mdview/ready` once its handshake is done; that is
  the frame's first message, so the relay locks the frame's origin on it and
  later inits go to that origin only. The SPA ignores any init after its
  handshake (`src/client/lib/embed.ts`), which is what stops the two sides from
  answering each other forever, and a `set-file` for the file already showing
  changes nothing.

### Asset responses

`/__asset/*` serves files from inside a root, so it serves whatever a document's
author put there — including an SVG with a `<script>`. A policy on a subresource
does not affect its use in `<img>`, `<video>` or `<audio>`; it only applies when
the file is opened as a document (a new tab, a frame). Every response from the
route, success or error, carries `ASSET_SECURITY_HEADERS`
(`src/server/routes/api-asset.ts`), applied in the same `onSend` hook. The hook
matches on the route as well as the raw URL, because the router decodes
`/%5F%5Fasset/...` onto the asset route while `req.url` keeps the escapes, and it
also covers any `image/svg+xml` response:

| Header | Value | Why |
|---|---|---|
| `content-security-policy` | `default-src 'none'; style-src 'unsafe-inline'; sandbox; frame-ancestors 'none'` | `sandbox` gives a directly opened SVG an opaque origin and no script, so it cannot read other files. Inline styles keep SVGs drawing correctly. |
| `x-content-type-options` | `nosniff` | The declared media type is the only one the browser uses. |
| `cross-origin-resource-policy` | `same-origin` | Another site cannot embed the user's files through the loopback port. |

The route serves an allow-list of image, video and audio types only, and 404s
any path with a segment that starts with `.`, on the requested or the real path.
For a single-file root it serves only the paths the document references.

## Design constraints baked in

- **No new `innerHTML` patterns** beyond the one in `Content.tsx`. Use Preact JSX for dynamic UI; use `createElement` + `append` for DOM augmentation.
- **`.js` import extensions** in TypeScript source. Node ESM + bundler convention.
- **Strict TypeScript** with `noUncheckedIndexedAccess`. Avoid `any`.
- **Lazy-load expensive features** — diagrams (pele), katex, syntax-highlighter languages, font subsets.
- **Idempotent DOM helpers** — every wire checks a marker before mutating.
- **Single source of truth** for shortcuts (`shortcuts.ts`), wires (`wires.ts`), persisted signals (`persisted-signal.ts`), tree utilities (`shared/tree-utils.ts`), search regex (`shared/search-pattern.ts`).
