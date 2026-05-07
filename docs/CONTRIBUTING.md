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

Run all three before sending a change:

```bash
npm run typecheck     # tsc --noEmit on both server and client tsconfigs
npm test              # vitest run — 34 tests
npm run build         # vite + tsup must both succeed
```

## Project layout (where things go)

```
src/
├── cli.ts                          ← CLI entry point, args, port fallback
├── shared/
│   └── types.ts                    ← types shared between server and client
├── server/
│   ├── index.ts                    ← createServer factory
│   ├── routes/
│   │   ├── api-file.ts             ← GET /api/file
│   │   ├── api-tree.ts             ← GET /api/tree
│   │   ├── api-asset.ts            ← GET /__asset/*
│   │   └── sse.ts                  ← GET /api/watch
│   ├── render/                     ← markdown rendering pipeline
│   │   ├── markdown.ts
│   │   ├── shiki.ts
│   │   ├── frontmatter.ts
│   │   ├── outline.ts
│   │   └── links.ts                ← tagInternalLinks, rewriteImageSrc
│   ├── fs/
│   │   ├── resolve.ts              ← resolveSafePath (security boundary!)
│   │   └── tree.ts                 ← walkFolder
│   └── watcher.ts                  ← chokidar wrapper
└── client/
    ├── main.tsx                    ← Preact mount
    ├── App.tsx                     ← top-level orchestration
    ├── components/                 ← UI components (panes + overlays)
    ├── hooks/                      ← signals + effects (use*.ts)
    ├── lib/                        ← DOM augmentation helpers (wire*.ts) + pure utils
    └── styles/                     ← CSS — see "Styling" below

tests/
├── server/                         ← vitest unit tests for server logic
└── client/                         ← vitest tests for pure client logic

test-fixtures/                      ← manual-test markdown files
docs/                               ← architecture, contributing, features
```

### Where to add a new feature

| Adding... | Goes in... |
|-----------|------------|
| A new server endpoint | `src/server/routes/<name>.ts` + register in `src/server/index.ts` |
| A new piece of rendering logic | `src/server/render/<name>.ts` + call from `routes/api-file.ts` |
| A new pane / overlay component | `src/client/components/<Name>.tsx` |
| A new piece of cross-component state | `src/client/hooks/use<Name>.ts` (signal-based) |
| A new behavior that walks the rendered HTML | `src/client/lib/<name>.ts` exporting `wireXxx(root)`; call from `Content.tsx` |
| A new keyboard shortcut | edit `src/client/hooks/useKeyboardShortcuts.ts` + add to `components/ShortcutsPanel.tsx` |
| A new icon | append to `src/client/components/Icons.tsx` (inline SVG, inherits `currentColor`) |
| A new theme variable | edit `src/client/styles/theme.css` (use the existing `:root[data-theme=...]` blocks) |

## Conventions

### Imports
- Use `.js` extensions even in `.ts`/`.tsx` source. Node ESM + bundler convention.
- Type-only imports use `import type {...}`.

### Components
- Use `class=` not `className=` (Preact convention).
- Read signals via `signal.value` in JSX — this auto-subscribes the read site for fine-grained re-renders.
- Keep components small. If a component grows past ~120 lines, split it.

### State
- **Cross-component state → signals** in `src/client/hooks/use*.ts`. Pattern:
  ```ts
  // useFoo.ts
  import { signal } from '@preact/signals';
  export const fooSignal = signal<Foo>(defaultValue);
  export function setFoo(next: Foo): void { fooSignal.value = next; }
  ```
- **Component-local transient state → `useState`**. E.g. an input's value while the user types.
- Don't `useState` for shared state — it leads to prop drilling and the kind of update-batching bugs we hit early on with the search counter.

### DOM augmentation
- After `innerHTML = file.html`, the only way to add behavior to rendered nodes is a `wireXxx(root)` helper in `src/client/lib/`.
- Every helper MUST be idempotent. Use a marker class or `dataset.<flag> = '1'` to skip already-processed nodes — live reload re-runs all helpers on the same DOM.
- Don't call `.innerHTML = ...` inside helpers. Use `document.createElement` + `append`.

### Security
- Every filesystem read on the server goes through `resolveSafePath(rootAbsPath, rel)`. No exceptions.
- External links: `target="_blank"` MUST pair with `rel="noopener noreferrer"`.
- Don't introduce `eval`, `new Function`, or `innerHTML` from user-controlled strings.
- Server binds to `127.0.0.1` only — keep it that way.

### TypeScript
- `noUncheckedIndexedAccess` is enabled. Use `?.` or null-checks on array indexing.
- Avoid `any`. `as never` is acceptable as a narrowing cast for library types we don't control (see `shiki.ts`'s `loadLanguage(lang as never)`).

### Styling
- One stylesheet per concern: `reset.css`, `theme.css` (CSS vars only), `layout.css` (3-pane grid), `content.css` (markdown typography), `components.css` (everything else).
- Use CSS variables for colors, fonts, radii, transitions. Never hardcode `#abc123` outside `theme.css`.
- Animations: 160–220 ms `ease`. Don't go longer or use elastic easings.
- Use `transition` on hover/focus states. Match `var(--transition)` for consistency.

### Commits
- Conventional-ish commit messages: `feat(ui): ...`, `fix: ...`, `chore: ...`, `docs: ...`.
- One logical change per commit. Don't bundle unrelated work.

## Testing patterns

### Server logic — TDD where it's easy
Logic-heavy modules (parsers, resolvers, walkers, link rewriters, outline extractors) have unit tests under `tests/server/`. Add a test file when you add a new module of this kind.

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
We don't snapshot-test components. We DO test pure functions extracted from components (see `pickActiveId` extracted from `useScrollSpy`).

If you write a tricky pure function inside a component or hook, extract it and test the extracted function. Don't test through the React rendering layer.

### UI — manual via `test-fixtures/`
`test-fixtures/showcase.md` exercises every rendering feature. Walk through it after any UI change:

```bash
node bin/mdview.mjs ./test-fixtures --no-open
# open http://127.0.0.1:7331/ in a browser
```

Verify whatever you changed renders correctly across light + dark themes.

## How to add a feature: worked example

Suppose you want to add a "back to top" button that appears after the user scrolls.

1. **Component**: create `src/client/components/BackToTop.tsx`. Take `scroller: HTMLElement | null` as a prop. Use `useEffect` to attach a scroll listener; use `useState` for visible/hidden. Render a `<button>` with an SVG icon when scrollTop > 600.
2. **Style**: add `.back-to-top` to `src/client/styles/components.css`. Position: fixed, bottom-right, accent background, smooth fade-in transition.
3. **Mount**: import in `App.tsx`, render inside `<main class="pane-main">` after the other overlays. Pass `scroller={mainRef.current}`.
4. **Verify**:
   - `npm run typecheck`
   - `npm run build`
   - `node bin/mdview.mjs ./test-fixtures --no-open`, open in browser, scroll a long doc, check button appears.
5. **Commit**: `feat(ui): back-to-top button on long scroll`.

## How to debug

- **Server-side issue?** Add `console.log` to the relevant `src/server/...` file, run `npm run build:server`, restart the server. Or use `node --inspect bin/mdview.mjs ...` and attach Chrome DevTools.
- **Client-side issue?** Use `npm run dev:client` for HMR + DevTools. The Preact DevTools browser extension works.
- **Live reload not firing?** Check the `EventSource` in DevTools' Network tab — `/api/watch` should be open with a stream of events.
- **Mermaid not rendering?** Check the browser console for the `import('mermaid')` chunk loading. The diagram's source is base64-decoded from `data-source` on the `.mermaid-block` div.

## Things to know about how the agents got here

- Built end-to-end in May 2026 across multiple iterations.
- Phase 1 (MVP) used a **subagent-driven implementation plan** with batched commits. The original plan is at `docs/superpowers/plans/2026-05-06-mdview-implementation.md` for historical reference.
- Phase 2+ are tracked in [`TODO.md`](../TODO.md).
- The product spec lives outside this repo at `~/.claude/plans/i-want-to-create-enumerated-eich.md`.

## Anti-patterns we explicitly avoid

- ❌ Adding state via `useState` for things multiple components need. Use signals.
- ❌ Mutating the rendered HTML directly from `useEffect` in a component instead of via a `wireXxx` helper.
- ❌ Creating a separate UI for each feature instead of reusing the existing overlay pattern (see `Lightbox`, `ShortcutsPanel`, `CommandPalette`).
- ❌ Skipping `resolveSafePath` for "internal" or "trusted" file paths. There's no such thing as a trusted user-supplied path.
- ❌ Big refactors bundled with feature work. Land them separately.
- ❌ Adding heavyweight dependencies. Each new dep should justify its weight; check the bundle delta with `npm run build`.
