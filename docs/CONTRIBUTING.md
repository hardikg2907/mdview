# Contributing

Practical guide for someone (human or agent) about to make changes.

> Read [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) first. It covers the system shape and the patterns referenced here.

## Setup

```bash
git clone <repo>
cd md-to-html
npm install
```

## Daily workflow

```bash
# Run the dev SPA against a manually-built server bundle:
npm run build:server                                  # one-shot
npm run dev:client                                    # vite dev server on :5173 with HMR
node bin/mdview.mjs ./test-fixtures --no-open --port 7331  # backend on :7331

# Or full prod build + run:
npm run build
node bin/mdview.mjs ./some/folder
```

The vite dev server proxies `/api/*` to `localhost:7331`, so HMR works for the client while the backend serves files. SSE live-reload works in this mode too.

## Quality gates

Run all four before sending a change:

```bash
npm run typecheck     # tsc --noEmit on both server and client tsconfigs
npm run lint          # biome check (lint only — formatter disabled)
npm test              # vitest run — 289 tests
npm run build         # vite + tsup must both succeed
npm audit             # 0 vulnerabilities required (release blocker, see CLAUDE.md §6)
```

`npm run lint:fix` will auto-apply the safe fixes Biome knows about (import order, dead code, optional chains, etc.). Lint config lives in `biome.json`; a11y rules are disabled because the custom keyboard-driven widgets (file tree, command palette, outline) intentionally diverge from generic ARIA patterns.

### Git hooks (husky)

Hooks live in `.husky/` and install automatically the first time you run `npm install` (via the `prepare` script). They run the gates above so you can't ship a broken tree by accident:

| Hook | Runs | Why |
|---|---|---|
| `pre-commit` | `npm run typecheck && npm run lint && npm test && npm audit` | Catches type errors, lint regressions, broken tests, and new advisories before the commit lands. ~6–7s on a clean tree. |
| `pre-push` | `npm run build` | Heavier (~25s). Catches anything that compiles in dev but not through `vite build` / `tsup`. |

`npm audit` requires network — if you're offline (flight, tunneled VPN) it'll fail and block the commit. In that genuine case use `git commit --no-verify` to bypass, then re-run the full gate set the next time you're online and before cutting a release. **Do not habitually `--no-verify`** — the hooks exist because every one of these failure modes has bitten this repo before.

## Project layout (where things go)

```
src/
├── cli.ts                          ← CLI entry: args, port-fallback, graceful shutdown
├── shared/                         ← cross-runtime modules — no Node-only or DOM-only deps
│   ├── types.ts
│   ├── search-pattern.ts            ← compilePattern (used by client + server)
│   ├── relative-time.ts             ← formatRelativeTime
│   └── tree-utils.ts                ← MD_EXT, flattenMdRelPaths
├── render/                         ← server-agnostic markdown render pipeline
│   ├── markdown.ts
│   ├── shiki.ts
│   ├── frontmatter.ts
│   ├── outline.ts
│   ├── links.ts                     ← tagInternalLinks, rewriteImageSrc
│   └── math.ts                      ← KaTeX placeholder emission
├── server/
│   ├── index.ts                     ← createServer factory + .mdview.json watcher
│   ├── config.ts                    ← validateConfig + loadProjectConfig
│   ├── routes/
│   │   ├── api-file.ts              ← GET /api/file
│   │   ├── api-tree.ts              ← GET /api/tree (carries project config)
│   │   ├── api-asset.ts             ← GET /__asset/*
│   │   ├── api-search.ts            ← GET /api/search
│   │   └── sse.ts                   ← GET /api/watch
│   ├── fs/
│   │   ├── resolve.ts               ← resolveSafePath (security boundary!)
│   │   ├── tree.ts                  ← walkFolder
│   │   └── grep.ts                  ← folder-wide search backend
│   └── watcher.ts                   ← chokidar wrapper + emitSynthetic
└── client/
    ├── main.tsx                    ← Preact mount + JetBrains Mono CSS
    ├── App.tsx                     ← top-level orchestration (slim — most logic in hooks)
    ├── shortcuts.ts                ← keyboard shortcut registry (single source of truth)
    ├── components/                 ← UI components (panes + overlays)
    ├── hooks/                      ← signals + effects (use*.ts)
    ├── lib/                        ← DOM augmentation helpers + pure utils
    └── styles/                     ← reset / theme / layout / content / components

tests/
├── server/                         ← vitest unit tests for server logic
└── client/                         ← vitest tests for pure client logic

test-fixtures/                      ← manual-test markdown files (showcase.md, math.md, …)
docs/                               ← architecture, contributing, features
```

### Where to add a new feature

| Adding... | Goes in... |
|-----------|------------|
| A new server endpoint | `src/server/routes/<name>.ts` + register in `src/server/index.ts` |
| A new piece of rendering logic | `src/render/<name>.ts` + call from `routes/api-file.ts` (or use as a markdown-it plugin) |
| A new module that has to run on both client and server | `src/shared/<name>.ts` (no Node-only or DOM-only deps) |
| A new pane / overlay component | `src/client/components/<Name>.tsx` |
| A new piece of cross-component state | `src/client/hooks/use<Name>.ts` (signal-based) |
| A new piece of **persisted** cross-component state | use `createPersistedBool` / `createPersistedNumber` / `createPersistedString` / `createPersistedSignal` from `src/client/lib/persisted-signal.ts` — don't roll your own localStorage |
| A new behavior that walks the rendered HTML | `src/client/lib/<name>.ts` exporting a `wireXxx(root, ctx)` function; add it to the `defaultWires` array in `src/client/lib/wires.ts` |
| A new keyboard shortcut | append a single entry to `src/client/shortcuts.ts` — both the dispatcher and the help modal read from there |
| A new icon | append to `src/client/components/Icons.tsx` (inline SVG, inherits `currentColor`) |
| A new theme variable | edit `src/client/styles/theme.css` (use the existing `:root[data-theme=...]` blocks); for a new palette, add `:root[data-palette="X"][data-theme="..."]` blocks |
| A new tooltip on a control | add `data-tooltip="..."` to the element (keep `aria-label` for screen readers); the CSS rule in `components.css` does the rest |

## Conventions

### Imports
- Use `.js` extensions even in `.ts`/`.tsx` source. Node ESM + bundler convention.
- Type-only imports use `import type {...}`.
- Things that need to run in both client and server live in `src/shared/`. Don't import client-only or server-only modules from there.

### Components
- Use `class=` not `className=` (Preact convention).
- Read signals via `signal.value` in JSX — this auto-subscribes the read site for fine-grained re-renders.
- Keep components small. If a component grows past ~120 lines, split it.

### State
- **Cross-component state → signals** in `src/client/hooks/use*.ts`.
- **Persisted state → `createPersistedSignal` (or a typed variant)**. Pattern:
  ```ts
  const fooBool = createPersistedBool('mdview-foo', false);
  export const fooSignal = fooBool.signal;
  export const setFoo = fooBool.set;
  ```
- **Component-local transient state → `useState`**.
- Don't `useState` for shared state — it leads to prop drilling and update-batching bugs.

### DOM augmentation
- After `innerHTML = file.html`, the only way to add behavior to rendered nodes is to add a `Wire` entry to `src/client/lib/wires.ts`. The `runWires` helper in `Content.tsx` will pick it up automatically.
- Every wire MUST be idempotent. Use a marker class or `dataset.<flag> = '1'` to skip already-processed nodes — live reload re-runs all wires on the same DOM.
- Don't call `.innerHTML = ...` inside helpers. Use `document.createElement` + `append`.

### Keyboard shortcuts
- One entry in `src/client/shortcuts.ts` registers the matcher, runner, displayed keys, and group. Both the runtime dispatcher and the help modal read from this same array.
- For sequence shortcuts (e.g. `gg`), use a module-scoped timestamp variable; reset it in `resetPendingSequences(ev)` so the dispatcher cleans up after non-matching keys.

### Security
- Every filesystem read on the server goes through `resolveSafePath(rootAbsPath, rel)`. No exceptions.
- External links: `target="_blank"` MUST pair with `rel="noopener noreferrer"`.
- Don't introduce `eval`, `new Function`, or `innerHTML` from user-controlled strings.
- `.mdview.json` validation lives in `src/server/config.ts`. Any new field that flows into CSS must be tightly type-checked there.
- Server binds to `127.0.0.1` only — keep it that way.

### TypeScript
- `noUncheckedIndexedAccess` is enabled. Use `?.` or null-checks on array indexing.
- Avoid `any`. `as never` is acceptable as a narrowing cast for library types we don't control (see `shiki.ts`'s `loadLanguage(lang as never)`).

### Styling
- One stylesheet per concern: `reset.css`, `theme.css` (CSS vars + palettes), `layout.css` (3-pane grid), `content.css` (markdown typography), `components.css` (everything else, including tooltips).
- Use CSS variables for colors, fonts, radii, transitions. Never hardcode `#abc123` outside `theme.css`.
- Animations: 160–220 ms `ease`. Don't go longer or use elastic easings.
- Use `transition` on hover/focus states. Match `var(--transition)` for consistency.
- Tooltip pattern: `data-tooltip="text"` on the element; optionally `data-tooltip-side="top"` or `data-tooltip-align="left"|"right"` for placement.

### Commits
- Conventional-ish commit messages: `feat(ui): ...`, `fix: ...`, `chore: ...`, `docs: ...`, `refactor: ...`.
- One logical change per commit. Don't bundle unrelated work.

## Testing patterns

### Server logic — TDD where it's easy
Logic-heavy modules (parsers, resolvers, walkers, link rewriters, outline extractors, the math plugin, grep, config validator) have unit tests under `tests/server/`. Add a test file when you add a new module of this kind.

Example template (`tests/server/<name>.test.ts`):
```ts
import { describe, it, expect } from 'vitest';
import { yourFunction } from '../../src/server/<path>/<name>.js';

describe('yourFunction', () => {
  it('does the thing', () => {
    expect(yourFunction(input)).toBe(expected);
  });
});
```

Run a single file: `npx vitest run tests/server/<name>.test.ts`.

### Client logic — pure functions only
We don't snapshot-test components. We DO test pure functions extracted from components (see `pickActiveId`, `filterOutline`, `nextSameLevelHeading`, `compilePattern`, `formatRelativeTime`).

If you write a tricky pure function inside a component or hook, extract it and test the extracted function. Don't test through the React rendering layer.

### UI — manual via `test-fixtures/`
`test-fixtures/showcase.md` exercises every rendering feature; `test-fixtures/math.md` covers KaTeX inline + block; `test-fixtures/linked-doc.md` is a navigation target. Walk through them after any UI change:

```bash
node bin/mdview.mjs ./test-fixtures --no-open
# open http://127.0.0.1:7331/ in a browser
```

Verify whatever you changed renders correctly across light + dark themes AND across all four palettes.

## How to add a feature: worked example

Suppose you want to add a "back to top" button that appears after the user scrolls.

1. **Component**: create `src/client/components/BackToTop.tsx`. Use `mainScrollerSignal.value` instead of taking the scroller as a prop. Use `useEffect` to attach a scroll listener; use `useState` for visible/hidden. Render a `<button>` with an SVG icon when scrollTop > 600. Add `data-tooltip="Back to top"` on the button.
2. **Style**: add `.back-to-top` to `src/client/styles/components.css`. Position: fixed, bottom-right, accent background, smooth fade-in transition.
3. **Mount**: import in `App.tsx`, render inside `<main class="pane-main">`.
4. **(Optional) Shortcut**: append an entry to `src/client/shortcuts.ts` with a key like `gg` (already taken — pick something else) or expose a button only.
5. **Verify**:
   - `npm run typecheck`
   - `npm run build`
   - `node bin/mdview.mjs ./test-fixtures --no-open`, open in browser, scroll a long doc, check button appears.
6. **Commit**: `feat(ui): back-to-top button on long scroll`.

## How to debug

- **Server-side issue?** Add `console.log` to the relevant `src/server/...` file, run `npm run build:server`, restart the server. Set `MDVIEW_DEBUG=1` for full stack traces. Or use `node --inspect bin/mdview.mjs ...` and attach Chrome DevTools.
- **Client-side issue?** Use `npm run dev:client` for HMR + DevTools. The Preact DevTools browser extension works.
- **Live reload not firing?** Check the `EventSource` in DevTools' Network tab — `/api/watch` should be open with a stream of events.
- **Mermaid not rendering?** Check the browser console for the `import('mermaid')` chunk loading. The diagram's source is URL-decoded from `data-source` on the `.mermaid-block` div.
- **Math not rendering?** Same idea — check for the `katex` chunk loading and the `katex.min.css` `<link>` injection.
- **Outline highlights wrong heading or focus mode lags?** Both are scroll-spy-related. The pure functions (`pickActiveId`, `nextSameLevelHeading`, `filterOutline`) are tested. The hooks themselves use bounding-rect deltas + `MutationObserver` on the **scroller subtree** (not `.markdown-content` directly — that doesn't exist at hook-mount because `<Content>` is gated on file-loaded).

## Things to know about how the agents got here

- Built end-to-end in May 2026 across multiple iterations.
- Phase 1 (MVP) used a **subagent-driven implementation plan** with batched commits. Original plan at `docs/superpowers/plans/2026-05-06-mdview-implementation.md` for historical reference.
- Phase 2 push (resizable sidebars, vim shortcuts, math, palettes/config, folder search, focus + minimap, last-updated, JetBrains Mono, outline filter, search options) landed in `a80842f`. The `refactor: drop static export…` commit (`721e76d`) reverted the originally-planned static export feature; bundle cost outweighed value.
- Phase 3 (workspaces) and Phase 4 (editor extensions) are tracked in [`TODO.md`](../TODO.md).

## Anti-patterns we explicitly avoid

- ❌ Adding state via `useState` for things multiple components need. Use signals.
- ❌ Hand-rolling `localStorage` `try/catch` blocks. Use `createPersistedSignal`.
- ❌ Mutating the rendered HTML directly from `useEffect` in a component instead of via a wire.
- ❌ Two implementations of the same flatten / regex-compile / persistence helper. Search `src/shared/` and `src/client/lib/` before writing new utilities.
- ❌ Adding a shortcut in two places (handler + panel). Single registry: `src/client/shortcuts.ts`.
- ❌ Creating a separate UI for each feature instead of reusing the existing overlay pattern (see `Lightbox`, `ShortcutsPanel`, `CommandPalette`).
- ❌ Skipping `resolveSafePath` for "internal" or "trusted" file paths. There's no such thing as a trusted user-supplied path.
- ❌ Big refactors bundled with feature work. Land them separately.
- ❌ Adding heavyweight dependencies. Each new dep should justify its weight; check the bundle delta with `npm run build`.
