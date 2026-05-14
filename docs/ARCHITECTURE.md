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

## Repo layout (post Phase 2)

```
src/
├── cli.ts                          ← CLI entry, args, port fallback, graceful shutdown
├── shared/                          ← cross-runtime modules (no Node-only or DOM-only deps)
│   ├── types.ts
│   ├── search-pattern.ts            ← compilePattern (case/word/regex) used by client + server
│   ├── relative-time.ts             ← formatRelativeTime (Updated N ago)
│   └── tree-utils.ts                ← MD_EXT, flattenMdRelPaths
├── render/                          ← pure server-agnostic markdown render pipeline
│   ├── markdown.ts
│   ├── shiki.ts
│   ├── frontmatter.ts
│   ├── outline.ts
│   ├── links.ts                     ← tagInternalLinks, rewriteImageSrc
│   └── math.ts                      ← KaTeX placeholder emission
├── server/
│   ├── index.ts                     ← createServer factory + .mdview.json watcher
│   ├── config.ts                    ← loadEffectiveConfig (global + project), mergeConfigs, validateConfig
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
```

## Server (`src/server/`)

### Entry & boot

- **`src/cli.ts`** — argument parser, port-fallback listener, browser launcher, SIGINT/SIGTERM shutdown with timeout, friendly error messages (port-in-use, ENOENT, EACCES). `MDVIEW_DEBUG=1` enables full stack traces.
- **`src/server/index.ts`** — `createServer(opts)` factory. Composes routes, registers `@fastify/static` for the bundled SPA at `/`, hooks `onClose` to close the chokidar watchers. Boots a **second chokidar watcher** dedicated to `.mdview.json` because the main watcher's `ignored` filter excludes dotfiles.

### Routes (`src/server/routes/`)

| Route | Purpose |
|-------|---------|
| `GET /api/file?path=...` | Read the file, parse frontmatter, render to HTML, extract outline, tag internal links, rewrite image src. Returns a `RenderedFile` (incl. `lastModified` mtime). |
| `GET /api/tree` | Walk the open folder; return a nested `TreeNode[]` with markdown files flagged. Response also carries the validated project `config` (`.mdview.json`). |
| `GET /api/search?q=...&case=...&word=...&regex=...` | Folder-wide grep. Caps per-file (20) and global (200); returns snippets with highlight ranges. |
| `GET /api/watch` | Server-Sent Events stream of `WatchEvent`s as files change. Includes a synthetic `config` event when `.mdview.json` changes. |
| `GET /__asset/*` | Serve user content assets (images, etc.) safely via `resolveSafePath`. |
| `GET /*` | Falls through to the static SPA bundle; SPA fallback for unknown routes (so client routing works on refresh). |

All request paths that touch the filesystem go through `resolveSafePath(rootAbsPath, rel)` — see `src/server/fs/resolve.ts` — which rejects absolute paths and traversal attempts.

### Rendering pipeline (`src/render/`)

The renderer lives in `src/render/`, **outside** `src/server/`, because it has no Node-only or HTTP-specific code. It can run from any context (server route, future editor extension, tests). Each request to `/api/file` runs through this pipeline in order:

1. **`frontmatter.ts`** — `parseFrontmatter(raw)` peels off `---`-delimited YAML using `gray-matter`. Returns `{ data, body }`.
2. **`markdown.ts`** — `renderMarkdown(body)` constructs a singleton `markdown-it` instance with `linkify`, `markdown-it-anchor` (custom slugify), `markdown-it-task-lists`, and the local **`mathPlugin`**. Walks the token list to intercept `fence` tokens: `mermaid` becomes a `<div class="mermaid-block" data-source="...">` for client rendering, everything else is highlighted via Shiki.
3. **`shiki.ts`** — `highlightCode(code, lang)` lazy-loads languages on demand; uses dual-theme (`github-light` / `github-dark`) with `defaultColor: false` so the client can swap themes purely via CSS.
4. **`math.ts`** — markdown-it core rule that scans for `$$...$$` paragraphs and `$...$` inline runs (with whitespace heuristics and code-span exclusion), emitting `<span class="math-inline">` / `<div class="math-block">` placeholders with URL-encoded `data-source`.
5. **`outline.ts`** — `extractOutline(tokens)` walks heading tokens, builds a nested `OutlineNode[]` tree using a stack-based algorithm. Handles non-monotonic depth jumps (e.g. h1 → h3 with no h2).
6. **`links.ts`** — `tagInternalLinks(html, currentRelPath)` adds `data-internal-link="<resolved-path>"` to relative `.md` `<a href>`s so the client can intercept them. `rewriteImageSrc(html, currentRelPath)` rewrites relative `<img src>` to `/__asset/<resolved>` so they resolve against the content root, not the SPA bundle.

### Filesystem (`src/server/fs/`)

- **`resolve.ts`** — `resolveSafePath(root, rel)` is the security boundary. Rejects absolute paths, normalizes the result, ensures it stays within `root`. Used by every fs read/write.
- **`tree.ts`** — `walkFolder(root, { ignore })` recursively walks the directory, skipping dotfiles and any directory whose basename is in the supplied ignore set (defaults to `DEFAULT_IGNORED_DIRS`). Sorts dirs first then alpha. Marks markdown files with `isMarkdown: true`.
- **`grep.ts`** — `grepFiles(rootAbsPath, query, opts)` for folder-wide search. Reuses `walkFolder` + `flattenMdRelPaths` + the shared `compilePattern`. Caps per-file and global. Strips frontmatter before grepping.
- **`ignore.ts`** — `DEFAULT_IGNORED_DIRS` (re-exported from `src/shared/ignore.ts` so the client tooltip can list the same names), `buildIgnoreSet(extra)` to union user-supplied basenames into the defaults, and `isPathIgnored(abs, root, set)` for the chokidar `ignored` callback. Plain basename equality — no globs, no regex.

### Config (`src/server/config.ts`)

Two layered files: **global** at `~/.config/mdview/config.json` (or `$XDG_CONFIG_HOME/mdview/config.json` when set) and **per-project** at `<root>/.mdview.json`. Same schema. `loadEffectiveConfig(rootAbsPath)` loads both in parallel and merges via `mergeConfigs` — project wins for scalar fields, `ignore` is unioned and deduped. Validation rejects unknown keys silently, drops invalid values with a `console.warn`, and never throws. `ignore` entries must match `/^[A-Za-z0-9_.\-+]{1,64}$/` and are not allowed to be `.` or `..`. The validated config flows into the `/api/tree` response. Scalar fields hot-reload when the project file changes; the `ignore` set is frozen at startup because chokidar caches its `ignored` callback at construction time.

### Watcher (`src/server/watcher.ts`)

A thin `chokidar` wrapper. Accepts an `ignore` set wired through to chokidar's `ignored` callback via `isPathIgnored`. Emits `WatchEvent`s with forward-slash relative paths (regardless of host OS). Awaits write-finish so a single save doesn't fire a flurry of events. Catches `EMFILE`/`ENOSPC` on the chokidar error channel and prints a hint pointing at the global config file. Exposes `emitSynthetic(event)` so the dedicated `.mdview.json` watcher can push `config` events through the same SSE stream.

## Client (`src/client/`)

### Entry

- **`src/client/main.tsx`** — mounts `<App />` to `#app`, imports JetBrains Mono CSS (400 + 600), then CSS files in order: reset → theme (CSS vars + palettes) → layout (3-pane grid) → content (markdown typography) → components (everything else).
- **`src/client/App.tsx`** — top-level orchestration. Now slim; most logic delegated to hooks (`usePathRouting`, `useLiveReload`, `useScrollSpy`, `useFocusedSection`, `useTheme`, `usePalette`).

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
| `paletteSignal` | `usePalette.ts` | `'classic' \| 'paper' \| 'nord' \| 'solarized'` |
| `fileSignal`, `fileLoading`, `fileError` | `useFile.ts` | Currently rendered file (incl. `lastModified`) |
| `treeSignal`, `configSignal` | `useTree.ts` | Folder tree + project config |
| `currentPathSignal` | `usePathRouting.ts` | Currently open file path |
| `mainScrollerSignal` | `useScroller.ts` | The `.pane-main` element ref (for shortcuts that need to scroll programmatically) |
| `activeHeadingId` | `useScrollSpy.ts` | **Topmost-passed** heading — drives outline highlight |
| `focusedSectionId` | `useFocusedSection.ts` | Heading whose section is at viewport **center** — drives focus mode (separate from `activeHeadingId`) |
| `treeCollapsedSignal`, `outlineCollapsedSignal`, `treeWidthSignal`, `outlineWidthSignal` | `useUiState.ts` | Sidebar collapse + width state |
| `focusModeSignal`, `minimapSignal` | `useUiState.ts` | Reading-mode toggles |
| `outlineLevelsSignal` | `useOutlineLevels.ts` | Set of heading levels visible in the outline |
| `searchOpenSignal`, `searchScopeSignal`, `searchCaseSensitiveSignal`, `searchWholeWordSignal`, `searchRegexSignal` | `useSearch.ts` | Search bar state |
| `paletteOpenSignal` | `useCommandPalette.ts` | ⌘P palette open |
| `lightboxSignal` | `useLightbox.ts` | Image lightbox `{ src, alt }` or null |
| `shortcutsPanelSignal` | `useShortcutsPanel.ts` | Help modal open |

### Components (`src/client/components/`)

- **`Header.tsx`** — brand chip, breadcrumbs, focus / minimap / palette / theme toggles, sidebar collapse buttons. All controls have `data-tooltip` for the custom subtle tooltip.
- **`PalettePicker.tsx`** — header dropdown with four swatches.
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
| `mermaid` | `mermaid-loader.ts` | Find `.mermaid-block` divs, dynamically `import('mermaid')`, render each as SVG. Bundle never loaded if no diagrams exist. |
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
- **`useFocusedSection` → `focusedSectionId`**: the *heading whose section contains the viewport center*. Drives focus mode. Independent of where the heading itself is visually.

Both use **bounding-rect deltas** (not `offsetTop`, which is relative to the nearest positioned ancestor and was misaligned with `scrollContainer.scrollTop`), cache the heading list, refresh via `ResizeObserver` on the scroller, and use `MutationObserver` on the **scroller (subtree)** — observing `.markdown-content` directly missed initial mount because `<Content>` is gated on file-loaded. Both apply a no-op-write guard to avoid notifying downstream effects when the result didn't change.

The MutationObserver also watches `attributes` with `attributeFilter: ['hidden']`. Collapsing a section toggles the `hidden` attribute on every trailing sibling of the folded heading — that collapses their layout boxes without producing any `childList` mutation, so without this extension the cached heading offsets would go stale after a fold and `pickActiveId` would highlight the wrong heading.

### Live reload (`useLiveReload.ts`)

Subscribes to `/api/watch` via `useSSE`. On `change` for the current file, snapshots `mainRef.current.scrollTop`, re-fetches `/api/file`, restores scroll. On `add` / `unlink` / `config`, re-fetches `/api/tree` (which carries the project config too).

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

- **`tsup`** bundles `src/cli.ts` → `bin/mdview.mjs` (Node ESM, ~26 KB minified). `bin/` is gitignored; produced by `npm run build:server`.
- **Vite** builds the client SPA → `dist/client/` (HTML + hashed assets). `dist/` is gitignored; produced by `npm run build:client`.
- The server bundle imports `dist/client/index.html` at runtime (resolved relative to the binary's own location).
- `mermaid`, `katex` (+ its CSS), Shiki language packs, and JetBrains Mono subsets are split into separate chunks (lazy-loaded).
- `prepare` script auto-runs `npm run build` if `bin/mdview.mjs` is missing, so `npm install -g github:user/repo` works without an explicit build step.

## Tests (`tests/`)

- **`tests/server/`** — vitest unit tests for every logic-heavy module (markdown, math, shiki, frontmatter, outline, resolve, tree, links, grep, config). Node env.
- **`tests/client/`** — persisted-signal, scroll-spy, outline-nav, outline-filter, search-pattern, relative-time. happy-dom env.
- 97 tests total. UI components have **no automated tests** — verified via manual walks of `test-fixtures/` (`showcase.md`, `math.md`, `linked-doc.md`).

## Security model

- **Trust boundary:** the user owns the markdown content. Server-rendered HTML is injected via `innerHTML` because we trust what we ourselves rendered. Inline HTML inside markdown is also passed through (the user wrote it).
- **External boundary:** `resolveSafePath` is called on every filesystem read. Absolute paths and traversal are rejected.
- **External links:** `target="_blank"` is always paired with `rel="noopener noreferrer"`.
- **Clipboard:** writes only happen in user-initiated event handlers.
- **Project config:** `validateConfig` rejects `lineWidth` strings that don't match a tight character class (so untrusted CSS can't slip in via `.mdview.json`).
- The server binds to `127.0.0.1` only (never 0.0.0.0). Single-machine, single-user.

## Design constraints baked in

- **No new `innerHTML` patterns** beyond the one in `Content.tsx`. Use Preact JSX for dynamic UI; use `createElement` + `append` for DOM augmentation.
- **`.js` import extensions** in TypeScript source. Node ESM + bundler convention.
- **Strict TypeScript** with `noUncheckedIndexedAccess`. Avoid `any`.
- **Lazy-load expensive features** — mermaid, katex, syntax-highlighter languages, font subsets.
- **Idempotent DOM helpers** — every wire checks a marker before mutating.
- **Single source of truth** for shortcuts (`shortcuts.ts`), wires (`wires.ts`), persisted signals (`persisted-signal.ts`), tree utilities (`shared/tree-utils.ts`), search regex (`shared/search-pattern.ts`).
