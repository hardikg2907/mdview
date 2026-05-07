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
                                              │ subscribe /api/watch (SSE)
                                              ▼
                                     ┌────────────────────────┐
                                     │  3-pane reading view   │
                                     └────────────────────────┘
```

The server stays running for the lifetime of one CLI invocation. Killing the process tears everything down.

## Server (`src/server/`)

### Entry & boot

- **`src/cli.ts`** — argument parser, port-fallback listener, browser launcher, SIGINT/SIGTERM shutdown. Detects whether the target is a file or folder and produces a `RootInfo` describing the boot mode.
- **`src/server/index.ts`** — `createServer(opts)` factory. Composes routes, registers `@fastify/static` for the bundled SPA at `/`, hooks `onClose` to close the chokidar watcher.

### Routes (`src/server/routes/`)

| Route | Purpose |
|-------|---------|
| `GET /api/file?path=...` | Read the file, parse frontmatter, render to HTML, extract outline, tag internal links, rewrite image src. Returns a `RenderedFile`. |
| `GET /api/tree` | Walk the open folder; return a nested `TreeNode[]` with markdown files flagged. |
| `GET /api/watch` | Server-Sent Events stream of `WatchEvent`s as files change. |
| `GET /__asset/*` | Serve user content assets (images, etc.) safely via `resolveSafePath`. |
| `GET /*` | Falls through to the static SPA bundle; SPA fallback for unknown routes (so client routing works on refresh). |

All request paths that touch the filesystem go through `resolveSafePath(rootAbsPath, rel)` — see `src/server/fs/resolve.ts` — which rejects absolute paths and traversal attempts.

### Rendering pipeline (`src/server/render/`)

Each request to `/api/file` runs through this pipeline in order:

1. **`frontmatter.ts`** — `parseFrontmatter(raw)` peels off `---`-delimited YAML using `gray-matter`. Returns `{ data, body }`.
2. **`markdown.ts`** — `renderMarkdown(body)` constructs a singleton `markdown-it` instance with `linkify`, `markdown-it-anchor` (custom slugify), and `markdown-it-task-lists` plugins. Walks the token list to intercept `fence` tokens: `mermaid` becomes a `<div class="mermaid-block" data-source="...">` for client rendering, everything else is highlighted via Shiki.
3. **`shiki.ts`** — `highlightCode(code, lang)` lazy-loads languages on demand; uses dual-theme (`github-light` / `github-dark`) with `defaultColor: false` so the client can swap themes purely via CSS.
4. **`outline.ts`** — `extractOutline(tokens)` walks heading tokens, builds a nested `OutlineNode[]` tree using a stack-based algorithm. Handles non-monotonic depth jumps (e.g. h1 → h3 with no h2).
5. **`links.ts`** — `tagInternalLinks(html, currentRelPath)` adds `data-internal-link="<resolved-path>"` to relative `.md` `<a href>`s so the client can intercept them. `rewriteImageSrc(html, currentRelPath)` rewrites relative `<img src>` to `/__asset/<resolved>` so they resolve against the content root, not the SPA bundle.

### Filesystem (`src/server/fs/`)

- **`resolve.ts`** — `resolveSafePath(root, rel)` is the security boundary. Rejects absolute paths, normalizes the result, ensures it stays within `root`. Used by every fs read/write.
- **`tree.ts`** — `walkFolder(root)` recursively walks the directory, skipping dotfiles and `node_modules`, sorts dirs first then alpha. Marks markdown files with `isMarkdown: true`.

### Watcher (`src/server/watcher.ts`)

A thin `chokidar` wrapper. Emits `WatchEvent`s with forward-slash relative paths (regardless of host OS). Awaits write-finish so a single save doesn't fire a flurry of events.

## Client (`src/client/`)

### Entry

- **`src/client/main.tsx`** — mounts `<App />` to `#app`, imports CSS files in order: reset → theme (CSS vars) → layout (3-pane grid) → content (markdown typography) → components (everything else).
- **`src/client/App.tsx`** — top-level orchestration. Reads from signals, owns `currentPath` state, wires keyboard shortcuts, mounts overlays (Lightbox, ShortcutsPanel, CommandPalette).

### State model — signals over useState

State is split between:
- **Module-scoped signals** for cross-component shared state (theme, file content, current heading, search open, etc.). Located in `src/client/hooks/use*.ts`.
- **Component-local `useState`** for transient component state (e.g. the search query as the user types).

Signals are preferred for shared state because they auto-subscribe at the JSX read site and trigger fine-grained re-renders without prop-drilling. They also avoid React-style state-update batching weirdness inside effects (we hit one of those bugs in `SearchBar` early on; signals fixed it).

Key signals:

| Signal | File | Purpose |
|--------|------|---------|
| `themeSignal` | `useTheme.ts` | `'light' \| 'dark'` |
| `fileSignal`, `fileLoading`, `fileError` | `useFile.ts` | Currently rendered file |
| `treeSignal` | `useTree.ts` | Folder tree response |
| `activeHeadingId` | `useScrollSpy.ts` | Heading at top of viewport |
| `treeCollapsedSignal`, `outlineCollapsedSignal` | `useUiState.ts` | Sidebar collapse state |
| `searchOpenSignal` | `useSearch.ts` | In-doc search open |
| `paletteOpenSignal` | `useCommandPalette.ts` | ⌘P palette open |
| `lightboxSignal` | `useLightbox.ts` | Image lightbox `{ src, alt }` or null |
| `shortcutsPanelSignal` | `useShortcutsPanel.ts` | Help modal open |

### Components (`src/client/components/`)

Each pane is its own component:
- **`Header.tsx`** — brand chip, breadcrumbs, theme toggle, sidebar collapse buttons, keyboard-shortcuts button. Reads `themeSignal` directly.
- **`FolderTree.tsx`** — collapsible recursive tree of `TreeNode`s.
- **`Content.tsx`** — renders the file's HTML via `innerHTML` (it's server-rendered trusted content) and runs the **DOM augmentation pipeline** (see below).
- **`Outline.tsx`** — renders the heading tree with depth indentation, scroll-spy active highlight, and per-node collapse state.
- **`Breadcrumbs.tsx`** — renders the path from root to active heading, with each segment a clickable button.
- **`ReadingProgress.tsx`** — sticky bar at the bottom edge of the header, width tracks scroll progress.
- **`Lightbox.tsx`**, **`ShortcutsPanel.tsx`**, **`CommandPalette.tsx`** — overlay components, conditionally mounted from App based on signals.

### DOM augmentation pipeline (`src/client/lib/`)

After `Content.tsx` injects the server-rendered HTML, it runs a sequence of `wireXxx(root)` functions that walk the DOM and add interactive behavior. **This is the single most important pattern in the client.**

```ts
// in Content.tsx
ref.current.innerHTML = file.html;
void renderMermaidIn(ref.current);
wireInternalLinks(ref.current, onInternalNavigate);
wireCopyButtons(ref.current);
wirePermalinks(ref.current);
markExternalLinks(ref.current);
wireImageLightbox(ref.current);
```

Each helper is **idempotent** (uses a marker class or dataset flag to skip already-processed nodes), takes the root element, and performs one well-defined transformation:

| Helper | Effect |
|--------|--------|
| `mermaid-loader.ts` | Find `.mermaid-block` divs, dynamically `import('mermaid')`, render each block as SVG. Bundle is never loaded if no diagrams exist. |
| `link-router.ts` | Wires click handlers on `a[data-internal-link]` to navigate inside the SPA. |
| `copy-buttons.ts` | Appends a hover-revealed "Copy" button to each `<pre>`. Uses `navigator.clipboard.writeText`. |
| `permalinks.ts` | Appends a `#` anchor to each heading; click copies a deep-link URL to clipboard. |
| `external-links.ts` | Detects `http(s)` links not tagged as internal; adds `target="_blank"`, `rel="noopener noreferrer"`, and an inline SVG `↗` icon. |
| `image-lightbox.ts` | Wires click handlers on `<img>` elements to open the lightbox. |
| `search.ts` | Used by `SearchBar`: walks `.markdown-content` text nodes (excluding our injected widgets), finds query matches, wraps them in `<mark>`. |
| `file-search.ts` | Used by `CommandPalette`: flattens tree to file list, ranks by basename match → path match → fuzzy subsequence. |
| `doc-stats.ts` | Computes word count, reading time, heading count from the rendered HTML + outline. |

**To add a new behavior**, drop a new `wireXxx` helper, call it from `Content.tsx` after `innerHTML`. Don't add behavior to JSX components if it requires walking the rendered HTML — keep that in lib helpers.

### Live reload

`useSSE` subscribes to `/api/watch`. On every `WatchEvent` for the current file, App re-fetches `/api/file?path=...` and snapshots/restores `mainRef.current.scrollTop` around the swap. Outline collapse state is local to each `OutlineItem` so it survives re-renders.

For `add` / `unlink` events, the tree is also re-fetched.

### Keyboard shortcuts (`src/client/hooks/useKeyboardShortcuts.ts`)

A single global `keydown` listener attached at App mount. It checks for typing context (`isTypingTarget`) so bare-key shortcuts (`/`, `j`, `k`, `?`) don't fire inside inputs. Modifier shortcuts (`⌘B`, `⌘.`, `⌘\\`, `⌘F`, `⌘P`) always fire and `preventDefault()`.

To add a new shortcut: edit this hook and add an entry to `ShortcutsPanel.tsx`'s `GROUPS` array.

## Build pipeline

- **`tsup`** bundles `src/cli.ts` → `bin/mdview.mjs` (Node ESM, ~15 KB minified). `bin/mdview.mjs` is gitignored; produced by `npm run build:server`.
- **Vite** builds the client SPA → `dist/client/` (HTML + hashed assets). `dist/` is gitignored; produced by `npm run build:client`.
- The server bundle imports `dist/client/index.html` at runtime (resolved relative to the binary's own location).
- `mermaid`, `katex` (transitively) and Shiki language packs are split into separate chunks (lazy-loaded).

## Tests (`tests/`)

- **`tests/server/`** — vitest unit tests for every logic-heavy module (markdown, shiki, frontmatter, outline, resolve, tree, links). 31 tests.
- **`tests/client/`** — `scroll-spy.test.ts` covers `pickActiveId`'s pure-function behavior. 3 tests.
- UI components have **no automated tests** — they're verified via manual walks of `test-fixtures/showcase.md`. This is a deliberate trade-off (snapshot tests on UI tend to lock you in).

## Security model

- **Trust boundary:** the user owns the markdown content. Server-rendered HTML is injected via `innerHTML` because we trust what we ourselves rendered. Inline HTML inside markdown is also passed through (the user wrote it).
- **External boundary:** `resolveSafePath` is called on every filesystem read. Absolute paths and traversal are rejected.
- **External links:** `target="_blank"` is always paired with `rel="noopener noreferrer"`.
- **Clipboard:** writes only happen in user-initiated event handlers.
- The server binds to `127.0.0.1` only (never 0.0.0.0). Single-machine, single-user.

## Design constraints baked in

- **No new `innerHTML` patterns** beyond the one in `Content.tsx`. Use Preact JSX for dynamic UI; use `createElement` + `append` for DOM augmentation.
- **`.js` import extensions** in TypeScript source. This is the Node ESM + bundler convention.
- **Strict TypeScript** with `noUncheckedIndexedAccess`. No `any` casts unless escape-hatch is necessary (Shiki lang types are an exception).
- **Lazy-load expensive features** — mermaid, syntax-highlighter languages.
- **Idempotent DOM helpers** — every `wireXxx` checks a marker before mutating.
