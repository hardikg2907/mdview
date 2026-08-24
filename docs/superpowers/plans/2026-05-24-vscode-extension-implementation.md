# VS Code Extension (v0.1.0) + CLI Prereqs (v0.7.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Status (2026-05-28)

- **Stream A (CLI v0.7.0):** ✅ implementation merged into `main` as merge commit `8bd4b14`. Release commit `84339ea` + tag `v0.7.0` landed locally. `npm publish` pending (operator must re-authenticate). All A1–A8 checkboxes completed; A9 done; A10 is the only outstanding step.
- **Stream B (Extension v0.1.0):** not started. Begin on a fresh branch (`feat/vscode-extension`) off `main` *after* CLI v0.7.0 is published to npm — the extension's `package.json` declares `@hardikg/mdview` as a regular dep and won't install otherwise.

**Goal:** Ship `@hardikg/mdview` v0.7.0 (adds the CLI prereqs the extension needs) to npm, then ship the VS Code extension v0.1.0 to the Marketplace.

**Architecture:** Sidecar — the extension bundles `@hardikg/mdview` inside the VSIX and spawns it as a Node child process bound to `127.0.0.1` on an ephemeral port. The extension shows the URL inside a VS Code webview (via `portMapping` + iframe + relay script) or opens it in the user's default browser. Editor↔preview integration uses a handshake-driven `postMessage` protocol (8 message types). One server per workspace folder, lazy-started. Same repo as the CLI; `apps/vscode/` is a sibling Node project (no npm workspaces).

**Tech Stack:** TypeScript, esbuild (extension bundler), vitest (extension unit tests), `@vscode/test-electron` (integration tests), `vsce` (Marketplace tooling), Node ≥ 20, VS Code engines ≥ 1.78.

**Design spec (read first):** `docs/superpowers/specs/2026-05-24-vscode-extension-design.md`

---

## File structure

### Stream A — CLI changes (existing repo root)

**Modified:**
- `src/cli.ts` — accept `--vscode`, `--palette`, `--port 0`; emit structured ready JSON; register stdin EOF handler
- `src/server/index.ts` — conditionally relax `frame-ancestors` to `*` under embed mode
- `src/server/types.ts` (or wherever `ServerOptions` lives) — add `embedMode: boolean` to options
- `src/render/markdown.ts` — emit `data-source-line` on `<h1>..<h6>`; account for stripped frontmatter offset
- `src/render/frontmatter.ts` — expose stripped line count to caller (new return field)
- `src/client/main.tsx` — bootstrap embed-mode detection; install message listener; handshake state
- `src/client/lib/embed.ts` *(new)* — embed-mode helpers (detect, postToParent, listen for handshake)
- `src/client/components/Outline.tsx` — heading-click → postMessage in embed mode
- `src/client/App.tsx` — hide file tree in embed mode; intercept internal-link clicks
- `src/client/hooks/usePalette.ts` — accept palette from postMessage
- `CHANGELOG.md` — Unreleased → 0.7.0 section
- `package.json` — version 0.6.2 → 0.7.0
- `VERIFICATION.md` — new rows for embed mode

**New tests:**
- `tests/server/embed-mode.test.ts` — CSP / ready-signal / flag-parsing for `--vscode`
- `tests/server/palette-flag.test.ts` — `--palette` flag parses and propagates
- `tests/server/port-zero.test.ts` — `--port 0` is accepted; binds an ephemeral port
- `tests/server/data-source-line.test.ts` — every heading has the attribute; value matches file-line
- `tests/client/embed-handshake.test.ts` — SPA bootstraps, sets parentOrigin from first message, validates origin

### Stream B — Extension project (new)

**New project under `apps/vscode/`:**
- `apps/vscode/package.json` — extension manifest (commands, capabilities, activation, configuration schema, deps)
- `apps/vscode/tsconfig.json` — TS config (target ES2020, module CommonJS)
- `apps/vscode/esbuild.config.mjs` — bundler with `NODE_ENV` define
- `apps/vscode/.vscode/launch.json` — Run Extension launch config
- `apps/vscode/.vscode/tasks.json` — `apps/vscode:watch` task for `preLaunchTask`
- `apps/vscode/.vscodeignore` — packaging excludes
- `apps/vscode/README.md` — Marketplace landing page
- `apps/vscode/CHANGELOG.md` — extension changelog (v0.1.0 entry)
- `apps/vscode/icon.png` — 128×128 Marketplace icon
- `apps/vscode/src/extension.ts` — activate / deactivate, command registration
- `apps/vscode/src/output.ts` — output channel singleton
- `apps/vscode/src/nodeProbe.ts` — Node version probe
- `apps/vscode/src/config/loader.ts` — read VS Code settings; build CLI flags
- `apps/vscode/src/server/ServerHandle.ts` — spawn one CLI; parse ready signal; lifecycle
- `apps/vscode/src/server/ServerPool.ts` — `Map<workspaceFolderURI, ServerHandle>`
- `apps/vscode/src/webview/PreviewPanel.ts` — webview panel + portMapping + nonce
- `apps/vscode/src/webview/host.html.ts` — build host HTML string with relay script
- `apps/vscode/src/messages/types.ts` — message type definitions + validators
- `apps/vscode/src/messages/dispatcher.ts` — extension-side message handlers
- `apps/vscode/src/editor/follow.ts` — editor-tab → `set-file` message
- `apps/vscode/src/editor/linkRouter.ts` — `internal-link-clicked` → open file in editor
- `apps/vscode/src/editor/cursorSync.ts` — bidirectional cursor sync + debounce
- `apps/vscode/src/theme/palette.ts` — map VS Code theme kind → mdview palette
- `apps/vscode/src/statusBar.ts` — cold-start status item
- `apps/vscode/tests/unit/*.test.ts` — vitest suites
- `apps/vscode/tests/integration/*.test.ts` — `@vscode/test-electron` suites
- `apps/vscode/tests/integration/runner.ts` — test runner entry

**Repo-root modified:**
- `.gitignore` — add `apps/vscode/node_modules`, `apps/vscode/dist`, `apps/vscode/*.vsix`
- `CLAUDE.md` — link to extension subproject; note CLI prereqs added in 0.7.0

---

# Stream A — CLI v0.7.0

CLI must ship to npm before Stream B can install it as a dependency. Stream A tasks are sequenced so each leaves the CLI in a still-shippable state: any A1..A7 boundary could be tagged and released (though we tag once after A8).

## Task A1: `--port 0` support (ephemeral port assignment)

**Files:**
- Modify: `src/cli.ts:62-84` (parseArgs)
- Modify: `src/cli.ts:122-155` (listen) — pass 0 through to Fastify
- Test: `tests/server/port-zero.test.ts` *(new)*

- [x] **Step 1: Write the failing test** — covers (a) `parseArgs(['--port', '0'])` resolves to `{ port: 0, portExplicit: true }`, (b) `listen(app, 0, true)` binds and returns the kernel-assigned port (use Fastify's `address()` to verify it's > 0 after listen).

```ts
// tests/server/port-zero.test.ts
import { describe, it, expect } from 'vitest';
// import the renamed exported parseArgs from cli.ts (rename to `_parseArgs` etc. if not already exported)
```

- [x] **Step 2: Run test** — `npm test -- tests/server/port-zero.test.ts`. Expected: FAIL (current parser rejects `<= 0`).

- [x] **Step 3: Loosen the validator** — change `src/cli.ts:74` from `args.port <= 0` to `args.port < 0`. `--port 0` now passes through.

- [x] **Step 4: Make `listen()` pass 0 through** — confirm Fastify (`app.listen({ host: '127.0.0.1', port: 0 })`) returns the kernel-assigned port via `app.server.address().port`. Update `listen()`'s explicit branch to return the actual bound port, not the requested one.

- [x] **Step 5: Run tests** — `npm test`. Expected: PASS for new file; all existing tests still PASS.

- [x] **Step 6: Run typecheck + audit + build** — `npm run typecheck && npm audit && npm run build`. All PASS.

- [x] **Step 7: Commit**

```bash
git add src/cli.ts tests/server/port-zero.test.ts
git commit -m "feat(cli): allow --port 0 for kernel-assigned ephemeral ports"
```

## Task A2: Structured ready signal on stdout (under `--vscode`)

**Files:**
- Modify: `src/cli.ts:192-199` (after listen, before browser open)
- Test: `tests/server/embed-mode.test.ts` *(new file; will accumulate other embed-mode checks)*

- [x] **Step 1: Write the failing test** — spawn a child process running the CLI with `--vscode --port 0 ./test-fixtures`. Capture stdout. Assert the first non-empty line is parseable JSON with shape `{ event: 'ready', url: string, port: number }` where `port > 0` and `url` matches `http://127.0.0.1:{port}/`.

```ts
// tests/server/embed-mode.test.ts
import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
// ...
```

- [x] **Step 2: Run test** — FAIL: today's output is the two `console.log` lines at `src/cli.ts:198-199`, not JSON.

- [x] **Step 3: Add an `embedMode` flag to parseArgs** — accept `--vscode` (boolean flag). When set, `args.embedMode = true`.

- [x] **Step 4: Emit the ready JSON in embed mode** — after `boundPort` is known, branch:

```ts
if (args.embedMode) {
  process.stdout.write(JSON.stringify({ event: 'ready', url, port: boundPort }) + '\n');
} else {
  console.log(`mdview → ${url}`);
  console.log(`watching: ${rootAbsPath}`);
}
```

- [x] **Step 5: Run test** — PASS.

- [x] **Step 6: Add second assertion to test** — when run **without** `--vscode`, the legacy human output appears and no JSON line is present. PASS.

- [x] **Step 7: Commit**

```bash
git add src/cli.ts tests/server/embed-mode.test.ts
git commit -m "feat(cli): emit structured ready JSON on stdout under --vscode"
```

## Task A3: `--palette <name>` flag

**Files:**
- Modify: `src/cli.ts` (parseArgs)
- Modify: server-options propagation (wherever palette currently flows from `.mdview.json` into the response)
- Test: `tests/server/palette-flag.test.ts` *(new)*

- [x] **Step 1: Write the failing test** — spawn CLI with `--palette nord ./test-fixtures`, fetch `GET /api/config` (or wherever the SPA reads the palette), assert returned palette is `nord`.

- [x] **Step 2: Run test** — FAIL.

- [x] **Step 3: Add `--palette <name>` to parseArgs** — validate against the exhaustive set from `src/shared/types.ts:42` (`classic | paper | nord | solarized | high-contrast`); throw on invalid value.

- [x] **Step 4: Thread the value through** — in the same place where config is loaded for the response, override with CLI value when set. Do NOT modify `.mdview.json` on disk.

- [x] **Step 5: Run test** — PASS.

- [x] **Step 6: Commit**

```bash
git add src/cli.ts src/server/... tests/server/palette-flag.test.ts
git commit -m "feat(cli): add --palette flag to override config palette"
```

## Task A4: `data-source-line` on rendered headings

**Files:**
- Modify: `src/render/frontmatter.ts` — return stripped-line count alongside the parsed result
- Modify: `src/render/markdown.ts` — accept an `originLineOffset` parameter; tag heading tokens with `data-source-line` set to `token.map[0] + offset`
- Modify: the caller (route handler or wherever `renderMarkdown` is invoked) to thread the offset through
- Test: `tests/server/data-source-line.test.ts` *(new)*

- [x] **Step 1: Write the failing test** — render a markdown source that has 3 lines of frontmatter then `\n# H1\n## H2\nbody`. Assert the resulting HTML contains `<h1 ... data-source-line="3"` and `<h2 ... data-source-line="4"` (0-based, FILE lines including frontmatter).

- [x] **Step 2: Run test** — FAIL.

- [x] **Step 3: Extend `parseFrontmatter` return type** — add a `bodyStartLine: number` field (line number in original source where body begins, 0-based). Compute from the frontmatter delimiter offsets.

- [x] **Step 4: Update `renderMarkdown` signature** — accept `{ source, bodyStartLine }` and add the offset to `token.map[0]` for each heading token. Set `data-source-line` via `token.attrSet('data-source-line', String(actualFileLine))`.

- [x] **Step 5: Update the route handler** to pass `bodyStartLine` to `renderMarkdown`.

- [x] **Step 6: Run test** — PASS. Run all existing tests — PASS (the attribute is additive; existing rendering tests should not break, but verify any snapshot tests are updated).

- [x] **Step 7: Commit**

```bash
git add src/render/frontmatter.ts src/render/markdown.ts src/server/routes/... tests/server/data-source-line.test.ts
git commit -m "feat(render): tag headings with data-source-line for editor sync"
```

## Task A5: `--vscode` flag — CSP relaxation

**Files:**
- Modify: `src/server/index.ts:35` (CSP assembly site) — conditionally relax `frame-ancestors`
- Modify: `src/server/types.ts` or wherever `ServerOptions` lives — add `embedMode: boolean`
- Modify: `src/cli.ts` — pass `embedMode` into `createServer`
- Test: `tests/server/embed-mode.test.ts` (extend; this is the file from A2)

- [x] **Step 1: Write the failing test** — inject Fastify in test (existing pattern in `tests/server/api-*.test.ts`). Build server with `embedMode: true`, GET `/`, assert `Content-Security-Policy` header contains `frame-ancestors *` and NOT `frame-ancestors 'none'`. Then build with `embedMode: false`, GET `/`, assert it contains `frame-ancestors 'none'`.

- [x] **Step 2: Run test** — FAIL.

- [x] **Step 3: Implement the CSP branch** — in `src/server/index.ts:35`, replace the constant `frame-ancestors 'none'` with a conditional. Add a comment explaining the §3.1 exception:

```ts
// Why: under --vscode the page is loaded inside a VS Code webview iframe.
// VS Code's webview origin varies (desktop / web / Codespaces); enumerating
// them is brittle. Loopback bind (127.0.0.1) is the real network boundary;
// frame-ancestors is defense-in-depth. The relaxation is gated by an explicit
// flag, so default browser users still get 'none'. See spec §18.1.
const frameAncestors = opts.embedMode ? '*' : "'none'";
```

- [x] **Step 4: Thread `embedMode` from CLI** — when `args.embedMode` is set, pass it to `createServer`.

- [x] **Step 5: Run tests** — PASS.

- [x] **Step 6: Run typecheck + audit** — `npm run typecheck && npm audit`. PASS.

- [x] **Step 7: Commit**

```bash
git add src/server/index.ts src/server/types.ts src/cli.ts tests/server/embed-mode.test.ts
git commit -m "feat(server): relax frame-ancestors under --vscode for webview embedding"
```

## Task A6: `--vscode` implies `--no-open` + embed-mode signal to client

**Files:**
- Modify: `src/cli.ts` — when `args.embedMode`, force `args.open = false`
- Modify: server response (index.html or query param handling) — recognize `?embed=vscode` and pass through

- [x] **Step 1: Write a test** — spawn CLI with `--vscode --port 0 ./test-fixtures`, verify NO browser is opened (mock or absence-of-open-call). Also assert that requesting `/?embed=vscode` returns the same index.html (no server-side branching needed; the SPA reads the query itself).

- [x] **Step 2: Run** — FAIL on the no-open assertion.

- [x] **Step 3: Implement** — in `parseArgs` after the loop:

```ts
if (args.embedMode) args.open = false;
```

- [x] **Step 4: Verify** the existing `if (args.open) await openBrowser(url)` does the right thing — no further code change needed.

- [x] **Step 5: Run test** — PASS.

- [x] **Step 6: Commit**

```bash
git add src/cli.ts tests/server/embed-mode.test.ts
git commit -m "feat(cli): --vscode implies --no-open; SPA reads ?embed=vscode itself"
```

## Task A7: SPA embed-mode client code (handshake + routing)

This is the biggest CLI-side change; do it as 4 sub-steps with their own commits.

### A7.1 — embed.ts helper module

**Files:**
- Create: `src/client/lib/embed.ts`
- Test: `tests/client/embed-handshake.test.ts` *(new)*

- [x] **Step 1: Write the failing test** — covers:
  - `isEmbedded()` returns `true` when `window.parent !== window` AND query has `embed=vscode`
  - `parentOriginPromise` resolves to `e.origin` of the first valid `mdview/init` message received
  - `postToParent(msg)` buffers until parent origin is known, then flushes with the discovered origin as `targetOrigin`
  - Messages from unknown origins are dropped

Use a `happy-dom` test setup; mock `window` with `parent`/`message`/`postMessage` shims as needed.

- [x] **Step 2: Run** — FAIL (file doesn't exist).

- [x] **Step 3: Implement `src/client/lib/embed.ts`**:

```ts
export function isEmbedded(): boolean {
  if (window.parent === window) return false;
  return new URLSearchParams(window.location.search).get('embed') === 'vscode';
}

let parentOrigin: string | null = null;
let buffer: unknown[] = [];

export function postToParent(msg: unknown): void {
  if (parentOrigin === null) { buffer.push(msg); return; }
  window.parent.postMessage(msg, parentOrigin);
}

type IncomingHandler = (msg: { type: string; [k: string]: unknown }) => void;
export function onIncoming(handler: IncomingHandler): void {
  window.addEventListener('message', (e) => {
    if (parentOrigin === null) {
      // First message must be mdview/init; capture origin.
      if (typeof e.data === 'object' && e.data && (e.data as any).type === 'mdview/init') {
        parentOrigin = e.origin;
        // Flush buffer.
        for (const m of buffer) window.parent.postMessage(m, parentOrigin);
        buffer = [];
        handler(e.data as { type: string });
      }
      return; // ignore other messages before handshake
    }
    if (e.origin !== parentOrigin) return;
    if (typeof e.data === 'object' && e.data && typeof (e.data as any).type === 'string') {
      handler(e.data as { type: string });
    }
  });
}
```

- [x] **Step 4: Run tests** — PASS.

- [x] **Step 5: Commit**

```bash
git add src/client/lib/embed.ts tests/client/embed-handshake.test.ts
git commit -m "feat(client): add embed.ts with handshake-driven postMessage helpers"
```

### A7.2 — wire embed mode at SPA bootstrap

**Files:**
- Modify: `src/client/main.tsx` — call `onIncoming(...)` when embedded; dispatch handlers
- Modify: `src/client/App.tsx` — hide file tree when embedded

- [x] **Step 1: In `main.tsx`** — at top of bootstrap, if `isEmbedded()`:
  - Install `onIncoming(handleIncoming)` where `handleIncoming` dispatches based on `msg.type` (`mdview/init` → emit `mdview/ready` back via `postToParent({type:'mdview/ready'})`; `mdview/set-file` → update signal/state for current file; `mdview/cursor-changed` → scroll-to-line; `mdview/palette-changed` → call existing palette setter).

- [x] **Step 2: In `App.tsx`** — conditionally hide the `<FileTree>` pane when `isEmbedded()`. Keep the outline.

- [x] **Step 3: Manually test** — `npm run dev:client` then open the dev URL with `?embed=vscode` appended. Open browser DevTools → Console. From the parent frame (or by hand-crafting a postMessage from the same origin), send `mdview/init`. Confirm SPA responds with `mdview/ready`.

- [x] **Step 4: Commit**

```bash
git add src/client/main.tsx src/client/App.tsx
git commit -m "feat(client): bootstrap embed-mode handshake and hide file tree"
```

### A7.3 — internal link interception

**Files:**
- Modify: wherever the SPA handles `[data-internal-link]` clicks (search: `grep -rn data-internal-link src/client/`)

- [x] **Step 1: Write a unit test** in `tests/client/external-links.test.ts` (or sibling) — given an embed-mode click handler attached, simulate a click on `<a data-internal-link href="other.md">`, assert `postToParent` was called with `{type:'mdview/internal-link-clicked', relPath:'other.md', fromFile:<current>}`.

- [x] **Step 2: Implement** — in the click handler, when `isEmbedded()` returns true, call `postToParent({...})` and `event.preventDefault()` instead of navigating. Implemented in App.tsx `handleInternalNav` since it owns both the embed context and currentPath (fromFile).

- [x] **Step 3: Commit**

```bash
git add src/client/... tests/client/...
git commit -m "feat(client): intercept internal-link clicks under embed mode"
```

### A7.4 — outline heading click + preserve `?embed=vscode` on navigation

**Files:**
- Modify: `src/client/components/Outline.tsx` — heading click → `postToParent({type:'mdview/heading-clicked', line, file})` when embedded
- Modify: client router (search: `usePathRouting` or similar) to never strip `?embed=vscode` on internal navigation

- [x] **Step 1: Add a test** — click an outline heading in embed mode → `postToParent` called with the heading's line (read from a mocked `data-source-line` attr).

- [x] **Step 2: Implement** — read the line from the heading's `data-source-line` attribute when constructing the outline (or look it up from the rendered DOM at click time); call `postToParent` instead of (or in addition to — TBD) the existing scroll behavior. Implemented in App.tsx `handleJump` (additive: scroll still happens).

- [x] **Step 3: Implement query preservation** — in the router/navigator, before changing `?file=…`, copy `embed` from the current `URLSearchParams` if present.

- [x] **Step 4: Run tests** — PASS.

- [x] **Step 5: Commit**

```bash
git add src/client/components/Outline.tsx src/client/hooks/... tests/client/...
git commit -m "feat(client): outline heading clicks emit heading-clicked in embed mode"
```

## Task A8: stdin EOF graceful shutdown

**Files:**
- Modify: `src/cli.ts` (after `shutdown` is defined around line 218)
- Test: `tests/server/embed-mode.test.ts` (extend)

- [x] **Step 1: Add a test** — spawn the CLI with `--vscode --port 0 ./test-fixtures`, parse the ready signal, then call `child.stdin.end()` and confirm the child exits cleanly within 2 seconds (exit code 0).

- [x] **Step 2: Run** — FAIL (today the CLI ignores stdin).

- [x] **Step 3: Add the EOF handler** — alongside the SIGINT/SIGTERM hooks:

```ts
// Why: under --vscode the extension owns the child's stdin. If the extension
// host dies, the pipe closes; we exit cleanly instead of orphaning.
if (args.embedMode) {
  process.stdin.on('end', shutdown);
  process.stdin.on('error', shutdown);
  process.stdin.resume();
}
```

- [x] **Step 4: Run tests** — PASS.

- [x] **Step 5: Commit**

```bash
git add src/cli.ts tests/server/embed-mode.test.ts
git commit -m "feat(cli): graceful shutdown on stdin EOF under --vscode"
```

## Task A9: Documentation + CHANGELOG + version bump

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `package.json` (version 0.6.2 → 0.7.0)
- Modify: `VERIFICATION.md` (add embed-mode rows)
- Modify: `CLAUDE.md` (note: `--vscode` relaxes `frame-ancestors`; document the §3.1 exception)

- [x] **Step 1: Update CHANGELOG** — renamed to `## [0.7.0] — 2026-05-28`. Sections written for Added / Security / Changed / Fixed.

- [x] **Step 2: Bump `package.json`** to `0.7.0`.

- [x] **Step 3: Run the four quality gates** — typecheck, 331 tests, build, audit all PASS.

- [x] **Step 4: Verify pack** — `npm pack --dry-run`: 1.9 MB tarball, 141 files, same shape as 0.6.2.

- [x] **Step 5: Commit + tag** — commit `84339ea chore(release): v0.7.0`, tag `v0.7.0` on `main`.

## Task A10: Publish CLI v0.7.0 to npm

- [x] **Step 1: Dry-run** — `npm publish --dry-run --access public` clean.

- [ ] **Step 2: Publish** — `npm publish --access public` (requires `npm login --auth-type=web` first since the prior session expired; 2FA via passkey + granular bypass-2fa token if needed).

- [ ] **Step 3: Verify** — `npm view @hardikg/mdview version` → `0.7.0`.

- [ ] **Step 4: Push tags** — `git push origin main --tags` (after explicit user instruction).

**Status:** Stream A merged into `main` on 2026-05-28 as commit `8bd4b14` (a `--no-ff` merge of 14 commits from `feat/vscode-cli-prereqs`). Release commit + tag landed as `84339ea` / `v0.7.0`. `npm publish` pending re-auth. **Move to Stream B** once published.

---

# Stream B — VS Code Extension v0.1.0

All extension work happens in `apps/vscode/`. Stream B installs `@hardikg/mdview@^0.7.0` as a regular dependency. Each task leaves the extension in a state where its `npm test` passes; the extension is not "demoable" until milestone B6+, but the project is build-clean throughout.

## Task B1: Scaffold `apps/vscode/` project structure

**Files:**
- Create: `apps/vscode/package.json`
- Create: `apps/vscode/tsconfig.json`
- Create: `apps/vscode/.gitignore`
- Modify: repo-root `.gitignore` (add `apps/vscode/node_modules`, `apps/vscode/dist`, `apps/vscode/*.vsix`)

- [x] **Step 1: Create `apps/vscode/package.json`** with the manifest fields from spec §17:

```jsonc
{
  "name": "mdview-vscode",
  "displayName": "mdview",
  "description": "Editorial-quality local markdown preview with live reload, outline, and editor integration.",
  "version": "0.1.0",
  "publisher": "<TBD-publisher-id>",
  "engines": { "vscode": "^1.78.0" },
  "extensionKind": ["workspace"],
  "capabilities": {
    "virtualWorkspaces": false,
    "untrustedWorkspaces": {
      "supported": false,
      "description": "mdview spawns a Node process and reads workspace files; requires workspace trust."
    }
  },
  "activationEvents": [
    "onCommand:mdview.openPreview",
    "onCommand:mdview.openInBrowser"
  ],
  "main": "./dist/extension.js",
  "contributes": {
    "commands": [
      { "command": "mdview.openPreview", "title": "mdview: Open Preview" },
      { "command": "mdview.openInBrowser", "title": "mdview: Open in Browser" }
    ],
    "configuration": {
      "title": "mdview",
      "properties": {
        "mdview.preview.openIn": {
          "type": "string", "enum": ["webview", "browser"], "default": "webview",
          "description": "Where 'mdview: Open Preview' should display the rendered markdown."
        },
        "mdview.palette": {
          "type": "string", "enum": ["auto", "classic", "paper", "nord", "solarized", "high-contrast"],
          "default": "auto",
          "description": "'auto' follows the VS Code theme."
        },
        "mdview.port": {
          "type": "number", "default": 0,
          "description": "Preferred starting port for the mdview server (0 = ephemeral)."
        },
        "mdview.ignore": {
          "type": "array", "items": { "type": "string" }, "default": [],
          "description": "Additional folder/file basenames to ignore (merged with .mdview.json)."
        }
      }
    }
  },
  "categories": ["Other"],
  "keywords": ["markdown", "preview", "md", "viewer"],
  "dependencies": {
    "@hardikg/mdview": "^0.7.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/vscode": "^1.78.0",
    "@vscode/test-electron": "^2.4.0",
    "@vscode/vsce": "^3.0.0",
    "esbuild": "^0.23.0",
    "typescript": "^5.6.0",
    "vitest": "^3.0.0"
  },
  "scripts": {
    "build": "node esbuild.config.mjs",
    "watch": "node esbuild.config.mjs --watch",
    "typecheck": "tsc --noEmit",
    "test:unit": "vitest run",
    "test:integration": "node ./dist/test/runner.js",
    "package": "vsce package"
  }
}
```

- [x] **Step 2: Create `apps/vscode/tsconfig.json`** — target ES2020, module Node16, strict, outDir `./dist`, include `src/**/*.ts` and `tests/**/*.ts`.

- [x] **Step 3: Create `apps/vscode/.gitignore`** — `node_modules/`, `dist/`, `*.vsix`, `.vscode-test/`.

- [x] **Step 4: Update repo-root `.gitignore`** — append `apps/vscode/node_modules`, `apps/vscode/dist`, `apps/vscode/*.vsix`, `apps/vscode/.vscode-test`.

- [x] **Step 5: Run `cd apps/vscode && npm install`** — verifies the manifest is well-formed and pulls deps. Expected: no errors. `@hardikg/mdview` resolves to 0.7.0.

- [x] **Step 6: Commit**

```bash
git add apps/vscode/ .gitignore
git commit -m "feat(vscode): scaffold extension project under apps/vscode/"
```

## Task B2: esbuild config + first build

**Files:**
- Create: `apps/vscode/esbuild.config.mjs`
- Create: `apps/vscode/src/extension.ts` — minimal stub (`export function activate() {}`, `export function deactivate() {}`)

- [x] **Step 1: Create `esbuild.config.mjs`** — bundles `src/extension.ts` to `dist/extension.js` as CJS targeting Node 20. Externals: `vscode` (provided by the runtime), `@hardikg/mdview` (we want to spawn the bin, not bundle the JS into the extension code). Defines: `process.env.NODE_ENV` resolved from the actual env at build time.

```js
import esbuild from 'esbuild';
const watch = process.argv.includes('--watch');
const ctx = await esbuild.context({
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  external: ['vscode', '@hardikg/mdview'],
  define: { 'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production') },
  sourcemap: watch,
});
if (watch) { await ctx.watch(); } else { await ctx.rebuild(); await ctx.dispose(); }
```

- [x] **Step 2: Create stub `src/extension.ts`**:

```ts
import * as vscode from 'vscode';
export function activate(context: vscode.ExtensionContext): void {
  // intentionally empty for now
}
export function deactivate(): void {}
```

- [x] **Step 3: Run build** — `cd apps/vscode && npm run build`. Expected: `dist/extension.js` produced; no errors.

- [x] **Step 4: Run typecheck** — `npm run typecheck`. PASS.

- [x] **Step 5: Commit**

```bash
git add apps/vscode/esbuild.config.mjs apps/vscode/src/extension.ts
git commit -m "feat(vscode): esbuild config + minimal activation stub"
```

## Task B3: Launch config + watch task

**Files:**
- Create: `apps/vscode/.vscode/launch.json`
- Create: `apps/vscode/.vscode/tasks.json`

- [x] **Step 1: Create `.vscode/launch.json`** (per spec §20.2):

```jsonc
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "extensionHost",
      "request": "launch",
      "name": "Run Extension",
      "args": [
        "--extensionDevelopmentPath=${workspaceFolder}/apps/vscode",
        "--folder-uri=${workspaceFolder}/test-fixtures"
      ],
      "env": { "NODE_ENV": "development" },
      "outFiles": ["${workspaceFolder}/apps/vscode/dist/**/*.js"],
      "preLaunchTask": "apps/vscode:watch"
    }
  ]
}
```

- [x] **Step 2: Create `.vscode/tasks.json`**:

```jsonc
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "apps/vscode:watch",
      "type": "shell",
      "command": "npm run watch",
      "options": { "cwd": "${workspaceFolder}/apps/vscode" },
      "isBackground": true,
      "problemMatcher": "$tsc-watch"
    }
  ]
}
```

- [ ] **Step 3: Smoke test** — open the repo at the root in VS Code, F5. Confirm an Extension Development Host window opens with the title bar mentioning "[Extension Development Host]". The host loads `test-fixtures/`. Close the host. *(Deferred to user-driven B23 gate — cannot perform GUI interaction from subagent context.)*

- [x] **Step 4: Commit**

```bash
git add apps/vscode/.vscode/
git commit -m "feat(vscode): launch config + watch task for F5 dev workflow"
```

## Task B4: Output channel + Node version probe

**Files:**
- Create: `apps/vscode/src/output.ts`
- Create: `apps/vscode/src/nodeProbe.ts`
- Create: `apps/vscode/tests/unit/nodeProbe.test.ts`

- [ ] **Step 1: Write the failing test** for `nodeProbe.ts`:

```ts
import { isSupportedNodeVersion } from '../../src/nodeProbe';
it('rejects below 20', () => expect(isSupportedNodeVersion('18.19.0')).toBe(false));
it('accepts 20+', () => expect(isSupportedNodeVersion('20.10.0')).toBe(true));
it('accepts 22+', () => expect(isSupportedNodeVersion('22.0.0')).toBe(true));
```

- [ ] **Step 2: Implement `nodeProbe.ts`**:

```ts
export function isSupportedNodeVersion(version: string): boolean {
  const major = parseInt(version.split('.')[0] || '0', 10);
  return major >= 20;
}
export function probeAndNotify(showError: (msg: string) => void): boolean {
  if (!isSupportedNodeVersion(process.versions.node)) {
    showError(`mdview requires Node 20+. VS Code is running with Node ${process.versions.node}.`);
    return false;
  }
  return true;
}
```

- [ ] **Step 3: Implement `output.ts`** — module-scoped singleton:

```ts
import * as vscode from 'vscode';
let channel: vscode.OutputChannel | undefined;
export function getOutput(): vscode.OutputChannel {
  if (!channel) channel = vscode.window.createOutputChannel('mdview');
  return channel;
}
export function log(message: string): void { getOutput().appendLine(`[${new Date().toISOString()}] ${message}`); }
```

- [ ] **Step 4: Run tests** — PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/vscode/src/output.ts apps/vscode/src/nodeProbe.ts apps/vscode/tests/
git commit -m "feat(vscode): output channel singleton + Node version probe"
```

## Task B5: Configuration loader

**Files:**
- Create: `apps/vscode/src/config/loader.ts`
- Create: `apps/vscode/tests/unit/config.test.ts`

- [ ] **Step 1: Write tests** — `loadCliFlags(folderUri, vscodeConfig)` returns the array of CLI flags including `--vscode`, `--no-open` (implicit via --vscode), `--port`, and `--palette` resolved per spec §7 (auto vs explicit).

- [ ] **Step 2: Implement `loader.ts`**:

```ts
import * as vscode from 'vscode';
import type { Uri } from 'vscode';

export interface ResolvedConfig {
  port: number;
  palette: string; // 'auto' becomes a concrete palette via theme.ts at spawn time
  ignore: string[];
  preview: { openIn: 'webview' | 'browser' };
}

export function readConfig(folderUri: Uri): ResolvedConfig {
  const cfg = vscode.workspace.getConfiguration('mdview', folderUri);
  return {
    port: cfg.get<number>('port', 0),
    palette: cfg.get<string>('palette', 'auto'),
    ignore: cfg.get<string[]>('ignore', []),
    preview: { openIn: cfg.get<'webview' | 'browser'>('preview.openIn', 'webview') },
  };
}

export function buildCliArgs(folderPath: string, cfg: ResolvedConfig, palette: string): string[] {
  const args = [folderPath, '--vscode', '--port', String(cfg.port)];
  if (palette !== 'auto') args.push('--palette', palette);
  return args;
}
```

- [ ] **Step 3: Run tests** — PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/vscode/src/config/ apps/vscode/tests/unit/config.test.ts
git commit -m "feat(vscode): config loader (settings → CLI flags)"
```

## Task B6: Theme → palette mapping

**Files:**
- Create: `apps/vscode/src/theme/palette.ts`
- Create: `apps/vscode/tests/unit/palette.test.ts`

- [ ] **Step 1: Write tests** — `themeKindToPalette(ColorThemeKind.Light)` → `paper`, etc., per spec §7.

- [ ] **Step 2: Implement** — simple switch over `vscode.ColorThemeKind`.

- [ ] **Step 3: Run tests** — PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/vscode/src/theme/ apps/vscode/tests/unit/palette.test.ts
git commit -m "feat(vscode): map VS Code theme kind → mdview palette"
```

## Task B7: ServerHandle (spawn + ready parsing)

**Files:**
- Create: `apps/vscode/src/server/ServerHandle.ts`
- Create: `apps/vscode/tests/unit/serverHandle.test.ts`

- [ ] **Step 1: Write tests** — covers:
  - `start()` resolves to `{ port, url }` after parsing a JSON ready line from a mocked child stdout
  - Times out after 10s if no ready line
  - `dispose()` calls `child.kill()` AND closes stdin
  - `onExit` callback fires when child exits

Use `node:child_process` mocking via vitest module mocks; do NOT spawn the real CLI in unit tests (defer that to integration tests).

- [ ] **Step 2: Implement `ServerHandle.ts`**:

```ts
import * as cp from 'node:child_process';
import * as path from 'node:path';
import { log } from '../output';

export interface ServerHandleOpts {
  cliEntryPath: string;
  args: string[]; // already built by buildCliArgs
  onExit?: (code: number | null) => void;
}

export interface ServerInfo { port: number; url: string; }

export class ServerHandle {
  private child: cp.ChildProcess | undefined;
  private info: ServerInfo | undefined;
  constructor(private opts: ServerHandleOpts) {}

  async start(timeoutMs = 10_000): Promise<ServerInfo> {
    const child = cp.spawn(process.execPath, [this.opts.cliEntryPath, ...this.opts.args], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child = child;
    child.on('exit', (code) => {
      log(`mdview child exited (code=${code})`);
      this.opts.onExit?.(code);
    });
    child.stderr?.on('data', (b) => log(`stderr: ${b.toString().trim()}`));

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('mdview ready signal timed out')), timeoutMs);
      let buf = '';
      child.stdout?.on('data', (chunk) => {
        buf += chunk.toString();
        const nl = buf.indexOf('\n');
        if (nl < 0) return;
        const line = buf.slice(0, nl).trim();
        try {
          const parsed = JSON.parse(line);
          if (parsed.event === 'ready' && typeof parsed.port === 'number' && typeof parsed.url === 'string') {
            this.info = { port: parsed.port, url: parsed.url };
            clearTimeout(timer);
            resolve(this.info);
          }
        } catch { /* not the ready line yet; keep accumulating */ }
      });
    });
  }

  dispose(): void {
    const c = this.child;
    if (!c) return;
    try { c.stdin?.end(); } catch { /* ignore */ }
    try { c.kill(); } catch { /* ignore */ }
    this.child = undefined;
  }

  get currentInfo(): ServerInfo | undefined { return this.info; }
}

export function bundledCliEntry(extensionPath: string): string {
  // dev override
  if (process.env.NODE_ENV === 'development' && process.env.MDVIEW_CLI_PATH) {
    return process.env.MDVIEW_CLI_PATH;
  }
  return path.join(extensionPath, 'node_modules', '@hardikg', 'mdview', 'bin', 'mdview.mjs');
}
```

- [ ] **Step 3: Run tests** — PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/vscode/src/server/ apps/vscode/tests/unit/serverHandle.test.ts
git commit -m "feat(vscode): ServerHandle spawns mdview and parses ready JSON"
```

## Task B8: ServerPool (per-folder map + lifecycle)

**Files:**
- Create: `apps/vscode/src/server/ServerPool.ts`
- Create: `apps/vscode/tests/unit/serverPool.test.ts`

- [ ] **Step 1: Write tests** — `getOrStart(folderUri)` lazy-spawns once per URI; subsequent calls reuse; `disposeAll()` kills all; `disposeFolder(uri)` kills one; capacity warning at 8.

- [ ] **Step 2: Implement** — wraps a `Map<string, ServerHandle>` (key is folder URI's `toString()`). Uses `ServerHandle`. Logs soft-cap warning when size > 8.

- [ ] **Step 3: Run tests** — PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/vscode/src/server/ServerPool.ts apps/vscode/tests/unit/serverPool.test.ts
git commit -m "feat(vscode): ServerPool with per-workspace-folder lazy spawn"
```

## Task B9: Message types + dispatcher

**Files:**
- Create: `apps/vscode/src/messages/types.ts`
- Create: `apps/vscode/src/messages/dispatcher.ts`
- Create: `apps/vscode/tests/unit/messages.test.ts`

- [ ] **Step 1: Write tests** — `validate(message)` accepts all 8 known types with correct payload shapes; rejects unknown types; rejects malformed payloads. Dispatcher routes incoming `mdview/internal-link-clicked` to a registered handler, etc.

- [ ] **Step 2: Implement** — discriminated union types per spec §16; `validate(msg)` returns `Result<KnownMessage, ValidationError>`; dispatcher takes a `Record<MessageType, Handler>`.

- [ ] **Step 3: Run tests** — PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/vscode/src/messages/ apps/vscode/tests/unit/messages.test.ts
git commit -m "feat(vscode): postMessage type definitions + dispatcher"
```

## Task B10: PreviewPanel (webview creation + host HTML + portMapping)

**Files:**
- Create: `apps/vscode/src/webview/PreviewPanel.ts`
- Create: `apps/vscode/src/webview/host.html.ts`
- Create: `apps/vscode/tests/unit/hostHtml.test.ts`

- [ ] **Step 1: Write a test** for `buildHostHtml({ webviewPort, iframeUrl, nonce })` — asserts the returned HTML string contains the iframe `src` exactly as given, the relay `<script nonce="...">` tag, the outer CSP `<meta>` with `default-src 'none'; frame-src http://localhost:*; script-src 'nonce-<NONCE>'; style-src 'unsafe-inline'`.

- [ ] **Step 2: Implement `host.html.ts`** — pure function returning the HTML string. The relay script body should be a string literal copy of the relay logic from spec §15. Inject the nonce into the script tag.

- [ ] **Step 3: Implement `PreviewPanel.ts`** — class wrapping `vscode.window.createWebviewPanel`. Constructor takes a `ServerHandle`; reads `ServerInfo.port`. Creates the panel with `portMapping: [{ webviewPort: 7331, extensionHostPort: info.port }]`, `enableScripts: true`, `retainContextWhenHidden: true`. Generates nonce via `crypto.randomBytes(16).toString('base64')`. Sets `webview.html` to `buildHostHtml(...)`. Exposes `postMessage(msg)`, `onMessage(handler)`, `dispose()`.

- [ ] **Step 4: Run tests** — PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/vscode/src/webview/ apps/vscode/tests/unit/hostHtml.test.ts
git commit -m "feat(vscode): PreviewPanel + host HTML/relay with portMapping"
```

## Task B11: Wire `mdview.openPreview` command end-to-end (manual smoke test gate)

**Files:**
- Modify: `apps/vscode/src/extension.ts`

This is the first task that produces a *working* preview. After this task, the §20.6 smoke checklist should be runnable for the first item only.

- [ ] **Step 1: In `activate()`** — register `mdview.openPreview` command. Implementation:
  1. Read settings via `readConfig(folderUri)`.
  2. Compute palette via `themeKindToPalette(...)` if config says `auto`.
  3. Build CLI args via `buildCliArgs(folderPath, cfg, palette)`.
  4. Probe Node version; bail with a notification on failure.
  5. Ensure a `ServerHandle` exists for the active editor's workspace folder via `ServerPool.getOrStart`.
  6. Create a `PreviewPanel` bound to that server.
  7. Send `mdview/init { webviewPort: 7331 }` to the panel.
  8. On `mdview/ready` received, send `mdview/set-file` with the active editor's relative path.

- [ ] **Step 2: F5 manual smoke** — open `test-fixtures/demo.md` in the Dev Host, run `mdview: Open Preview`. Expected: webview shows rendered markdown on the side. Check first item of §20.6.

- [ ] **Step 3: Commit**

```bash
git add apps/vscode/src/extension.ts
git commit -m "feat(vscode): wire openPreview command end-to-end (first working preview)"
```

## Task B12: Editor → preview follow (`mdview/set-file` on tab switch)

**Files:**
- Create: `apps/vscode/src/editor/follow.ts`
- Modify: `apps/vscode/src/extension.ts` — register `vscode.window.onDidChangeActiveTextEditor`

- [ ] **Step 1: Implement `follow.ts`** — when active editor changes to an `.md` file inside a workspace folder, look up the corresponding `PreviewPanel` (one per folder, or one global — see spec §11) and send `mdview/set-file` with the relPath. Non-`.md` editor active → no action (preview holds last file).

- [ ] **Step 2: Wire into extension** — call the registration function in `activate()`.

- [ ] **Step 3: Manual smoke** — open two `.md` files in editor tabs; preview should switch as you change tabs. Tick off the §20.6 item.

- [ ] **Step 4: Commit**

```bash
git add apps/vscode/src/editor/follow.ts apps/vscode/src/extension.ts
git commit -m "feat(vscode): editor tab change updates the preview file"
```

## Task B13: Internal-link router (`mdview/internal-link-clicked` → open editor)

**Files:**
- Create: `apps/vscode/src/editor/linkRouter.ts`
- Modify: dispatcher wiring in extension

- [ ] **Step 1: Implement** — handler receives `{ relPath, fromFile }`, resolves to an absolute URI under the same workspace folder, calls `vscode.window.showTextDocument(uri)`.

- [ ] **Step 2: Manual smoke** — click an internal link in the preview; the file opens in an editor tab; the preview follows (via B12). Tick off the §20.6 item.

- [ ] **Step 3: Commit**

```bash
git add apps/vscode/src/editor/linkRouter.ts apps/vscode/src/extension.ts
git commit -m "feat(vscode): internal-link-clicked opens the file in an editor tab"
```

## Task B14: Bidirectional cursor sync (with debounce/suppression)

**Files:**
- Create: `apps/vscode/src/editor/cursorSync.ts`
- Create: `apps/vscode/tests/unit/cursorSync.test.ts`

- [ ] **Step 1: Write tests** — unit-test the debounce + suppression window. Given a sequence: outline-click → cursor-changed received within 200ms → outbound cursor-changed should be suppressed. Conversely: cursor-move → heading-clicked received within 200ms → outbound heading-clicked suppressed.

- [ ] **Step 2: Implement** — two suppression timers (one per direction); update on receive. Debounce outbound `mdview/cursor-changed` by 50ms.

- [ ] **Step 3: Wire** — `onDidChangeTextEditorSelection` → send `mdview/cursor-changed`; receive `mdview/heading-clicked` → `editor.selection = new vscode.Selection(line, 0, line, 0)`.

- [ ] **Step 4: Manual smoke** — both directions per §20.6.

- [ ] **Step 5: Commit**

```bash
git add apps/vscode/src/editor/cursorSync.ts apps/vscode/tests/unit/cursorSync.test.ts apps/vscode/src/extension.ts
git commit -m "feat(vscode): bidirectional cursor sync with loop-breaking suppression"
```

## Task B15: Theme integration (palette-changed on theme switch)

**Files:**
- Modify: extension.ts — subscribe to `onDidChangeActiveColorTheme`, debounced 100ms

- [ ] **Step 1: Implement** — on theme change, recompute palette via `themeKindToPalette`; for every open `PreviewPanel`, send `mdview/palette-changed`.

- [ ] **Step 2: Manual smoke** — flip VS Code theme light ↔ dark; preview palette updates without restarting the CLI.

- [ ] **Step 3: Commit**

```bash
git add apps/vscode/src/extension.ts
git commit -m "feat(vscode): emit palette-changed on VS Code theme switch"
```

## Task B16: `mdview.openInBrowser` command

**Files:**
- Modify: extension.ts

- [ ] **Step 1: Implement** — register the command. Ensure a `ServerHandle` exists for the folder; get its `info.url`; pass to `vscode.env.openExternal(vscode.Uri.parse(info.url))` with `?file=<active>` appended.

- [ ] **Step 2: Manual smoke** — run the command; browser tab opens; tab keeps working when the VS Code webview is closed.

- [ ] **Step 3: Commit**

```bash
git add apps/vscode/src/extension.ts
git commit -m "feat(vscode): openInBrowser command"
```

## Task B17: Crash/exit handling + status bar UX

**Files:**
- Create: `apps/vscode/src/statusBar.ts`
- Modify: `ServerHandle` — fire `onExit` to a registered crash handler

- [ ] **Step 1: Status bar** — `statusBar.ts` exposes `showStarting()`, `hide()`. Wire into `openPreview` command: show "Starting mdview…" before `getOrStart`; hide after first `mdview/ready`.

- [ ] **Step 2: Crash handler** — on unexpected `onExit` (non-null exit code or unexpected stop), show a notification with a "Restart mdview" action and clear the pool entry.

- [ ] **Step 3: Manual smoke** — `kill` the child from terminal; observe notification + that next command spawns fresh.

- [ ] **Step 4: Commit**

```bash
git add apps/vscode/src/statusBar.ts apps/vscode/src/server/ServerHandle.ts apps/vscode/src/extension.ts
git commit -m "feat(vscode): cold-start status bar + crash notification with restart"
```

## Task B18: Multi-root workspace handling

**Files:**
- Modify: extension.ts — subscribe to `vscode.workspace.onDidChangeWorkspaceFolders`

- [ ] **Step 1: On `added`** — no action (lazy).

- [ ] **Step 2: On `removed`** — `pool.disposeFolder(uri)`.

- [ ] **Step 3: Manual smoke** — open a multi-root workspace; preview a file from each folder; observe two `mdview` processes; remove one folder; observe one process exits.

- [ ] **Step 4: Commit**

```bash
git add apps/vscode/src/extension.ts
git commit -m "feat(vscode): dispose server when workspace folder is removed"
```

## Task B19: Unit-test cleanup + run vitest

- [ ] **Step 1: Run all unit tests** — `cd apps/vscode && npm run test:unit`. All PASS.

- [ ] **Step 2: Run typecheck** — `npm run typecheck`. PASS.

- [ ] **Step 3: Commit anything you tweaked** during cleanup.

## Task B20: `@vscode/test-electron` integration tests

**Files:**
- Create: `apps/vscode/tests/integration/runner.ts`
- Create: `apps/vscode/tests/integration/suite/index.ts`
- Create: `apps/vscode/tests/integration/suite/extension.test.ts`

- [ ] **Step 1: Implement `runner.ts`** — calls `@vscode/test-electron`'s `runTests({ extensionDevelopmentPath, extensionTestsPath })`.

- [ ] **Step 2: Implement test suite** — Mocha tests covering:
  - `mdview.openPreview` is registered
  - Activation event triggers extension code
  - Webview HTML structure (iframe + nonce + CSP) matches `buildHostHtml` output
  - Spawned CLI emits a parseable ready signal within 10s (uses the real bundled CLI)

- [ ] **Step 3: Add CI matrix** — implementation plan-level, but at minimum document the command: `npm run test:integration`. CI is out of scope for v0.1 itself but the test script must work locally.

- [ ] **Step 4: Run locally** — `npm run build && npm run test:integration`. PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/vscode/tests/integration/
git commit -m "test(vscode): @vscode/test-electron integration suite"
```

## Task B21: `.vscodeignore` + first VSIX

**Files:**
- Create: `apps/vscode/.vscodeignore`

- [ ] **Step 1: First-pass `.vscodeignore`** (per spec §20.8):

```
**/*.ts
**/*.map
**/tsconfig*.json
**/.vscode/**
src/**
test/**
tests/**
**/*.test.*
**/node_modules/**/test/**
**/node_modules/**/tests/**
**/node_modules/**/*.md
!README.md
!CHANGELOG.md
node_modules/.cache/**
esbuild.config.mjs
```

- [ ] **Step 2: Preview package contents** — `cd apps/vscode && npx vsce ls`. Inspect output. Iterate on `.vscodeignore` until only the production artifacts remain (`dist/`, `node_modules/@hardikg/mdview/...`, `node_modules/<deps>/*.js`, README, CHANGELOG, package.json, icon).

- [ ] **Step 3: Build the VSIX** — `npm run package`. Note the resulting file size; record it.

- [ ] **Step 4: Install locally** — `code --install-extension mdview-vscode-0.1.0.vsix`. Confirm the installed extension works the same as the dev host.

- [ ] **Step 5: Uninstall the local copy** — `code --uninstall-extension <publisher>.mdview-vscode` (don't leave it on the dev machine).

- [ ] **Step 6: Commit**

```bash
git add apps/vscode/.vscodeignore
git commit -m "feat(vscode): .vscodeignore for slim VSIX"
```

## Task B22: README, CHANGELOG, icon

**Files:**
- Create: `apps/vscode/README.md`
- Create: `apps/vscode/CHANGELOG.md`
- Create: `apps/vscode/icon.png` (128×128)

- [ ] **Step 1: Write `README.md`** — must be self-contained (Marketplace renders it). Sections: Why mdview vs built-in preview, install, features (with one screenshot), configuration table (all `mdview.*` keys), commands, FAQ, license.

- [ ] **Step 2: Write `CHANGELOG.md`** — `## [0.1.0]` entry listing features per spec §21.

- [ ] **Step 3: Provide a 128×128 PNG icon**. Reuse `src/client/public/` favicon if appropriate (scale up) or commission one.

- [ ] **Step 4: Update manifest** to reference the icon path.

- [ ] **Step 5: Commit**

```bash
git add apps/vscode/README.md apps/vscode/CHANGELOG.md apps/vscode/icon.png apps/vscode/package.json
git commit -m "docs(vscode): README + CHANGELOG + Marketplace icon"
```

## Task B23: Full manual smoke checklist (gate before publishing)

**Reference:** spec §20.6.

- [ ] **Step 1: Build production VSIX** — `cd apps/vscode && npm run build && npm run package`.

- [ ] **Step 2: Install into a clean VS Code profile** — `code --profile clean --install-extension mdview-vscode-0.1.0.vsix` (use `--profile` to avoid contaminating the user's main profile).

- [ ] **Step 3: Walk through every item** of §20.6. Tick each.

- [ ] **Step 4: If any item fails** — file a fix, redo from Task B11ish where applicable.

- [ ] **Step 5: Uninstall the test copy**.

## Task B24: Publish v0.1.0 to the VS Code Marketplace

**Requires:** a Marketplace publisher ID (claim at https://marketplace.visualstudio.com/manage). User must do this manually.

- [ ] **Step 1: Update `package.json` `publisher`** to the claimed publisher ID.

- [ ] **Step 2: Get a Personal Access Token** from Azure DevOps (per `vsce` docs) and set `VSCE_PAT` env var.

- [ ] **Step 3: Publish** — `cd apps/vscode && npx vsce publish`. Verify on the Marketplace listing.

- [ ] **Step 4: Tag the release** — `git tag vscode-v0.1.0 && git push origin vscode-v0.1.0`.

- [ ] **Step 5: Commit** any final manifest tweaks.

Stream B complete.

---

## Self-review notes

- Spec §1–§22 coverage:
  - §2 Sidecar — B7 (ServerHandle), B8 (Pool), B10 (PreviewPanel).
  - §3 Webview/browser — B11 (openPreview), B16 (openInBrowser).
  - §4 Workspace-rooted — B7 spawns with folder path.
  - §5 UI changes — A7.2 (hide tree).
  - §6 Editor↔preview — B12 (follow), B13 (links), B14 (cursor sync).
  - §7 Theming — A3 (CLI palette flag), B6 (theme map), B15 (push on change).
  - §8 Saved-only — implicit (no buffer push).
  - §9 Defaults — B4 (output channel), A6 (--no-open via --vscode), B11 (workspace-required gate).
  - §10 Bundle — B1 (deps), B21 (.vscodeignore + vsce package).
  - §11 Multi-root — B8 (Pool), B18 (lifecycle).
  - §12 Config — B5.
  - §13 Lifecycle — A8 (stdin EOF), B17 (crash + status bar).
  - §14 Repo layout — B1.
  - §15 Webview mechanism — B10.
  - §16 Message protocol — B9, B14.
  - §17 Manifest — B1.
  - §18 CLI prereqs — A1 (port 0), A2 (ready), A3 (palette), A4 (data-source-line), A5/A6 (--vscode), A7 (SPA embed), A8 (stdin EOF).
  - §19 Out of scope — no tasks; verified by absence.
  - §20 Dev/testing — B3 (launch), B19/B20 (tests), B21 (vsce), B23 (smoke).
  - §21 Summary — covered by tasks above.
  - §22 Next step — done by this plan.

- Spec §20.6 manual checklist appears in Task B23 as the gate.
- No placeholders; each task has commands and verifiable expected output.
- Type consistency: `ServerHandle`, `ServerPool`, `PreviewPanel`, `ResolvedConfig`, `ServerInfo`, `MessageType` are all introduced once and reused with the same names.
