# VS Code Extension Design — `@hardikg/mdview`

**Status:** Draft, ready for user review (v3 — incorporates two independent design reviews)
**Date:** 2026-05-24

> This document captures *decisions we are keeping*. It is not a chat log.

## 1. Goal

Ship a VS Code extension that brings the `@hardikg/mdview` rendering experience into the editor for users who want to read markdown without leaving VS Code. The win over a browser tab is *editor integration*: switching files in the editor updates the preview, clicking links opens the file in an editor tab, and outline ↔ cursor sync ties the two surfaces together.

## 2. Shape — sidecar over rewrite

The extension is a **thin sidecar** around the published `@hardikg/mdview` CLI.

- Extension spawns the bundled `mdview` as a Node child process bound to `127.0.0.1` on an ephemeral port.
- The extension renders the resulting URL inside a VS Code webview (or the user's default browser) rather than re-implementing the renderer.
- All markdown rendering, math, mermaid, syntax highlighting, frontmatter, link rewriting, file watching, and SSE live-reload come from the CLI — none of it is duplicated in the extension.

Rationale: zero rendering rewrite, one source of truth, parity with the CLI by construction.

## 3. Preview surface — webview default, browser escape hatch

- **Primary surface:** a VS Code webview panel in `ViewColumn.Beside` (right of the current editor). Opened via command `mdview: Open Preview`.
- **Escape hatch:** command `mdview: Open in Browser` opens the same URL in the user's default browser.
- **Setting:** `mdview.preview.openIn` ∈ `"webview" | "browser"` to change the primary command's default. Defaults to `"webview"`.
- **Single-file mode:** explicitly out of scope for v0.1. Both commands require an open workspace folder; otherwise a notification says "open a folder to use mdview."

## 4. Scope — workspace-rooted, not file-rooted

- The mdview server is **always rooted at a workspace folder**, never at the active file's parent directory.
- The CLI is spawned with the workspace folder path as its `target` (so `RootInfo.rootKind === 'dir'`).
- Multi-root workspaces are handled per §11.

## 5. UI changes vs. the CLI

In embed mode the SPA hides certain elements that VS Code already provides. None of this requires CLI server changes; it is client-side conditional rendering keyed on the `?embed=vscode` query.

- **Hide:** the left-hand file tree. VS Code's Explorer already provides it.
- **Keep:** the right-hand outline (per-document headings) — its palette/scroll-spy/H1–H6 filter interactions are different from VS Code's outline pane and worth keeping.
- **Keep:** in-document search.
- **Keep:** the rendering surface and editorial typography.

## 6. Editor ↔ preview integration

The extension treats VS Code's active editor as the source of truth for *which file* is being previewed, and links the two surfaces via the postMessage protocol defined in §16.

- **Editor → preview follow:** when the user switches between `.md` files in editor tabs, the extension sends `mdview/set-file` to the SPA. The preview is not pinned; it follows the editor. When the active editor is a non-markdown file, the preview holds the last markdown file unchanged.
- **Internal markdown links open in the editor:** clicking `[doc](./other.md)` in the preview emits `mdview/internal-link-clicked` to the extension, which opens `other.md` in a VS Code editor tab. Editor-follow then triggers `set-file`. The SPA reuses the existing `data-internal-link` marker from `src/render/links.ts` to classify links — no new logic.
- **Anchor links** (`#heading`) still scroll within the preview without involving the extension.
- **Links outside the workspace folder** (e.g., `../README.md` to a parent the server refuses via `resolveSafePath`): the SPA continues to receive the existing 4xx response from the CLI; the extension shows a notification "link target is outside the workspace folder."
- **Bidirectional outline ↔ editor cursor sync:**
  - Editor cursor change → extension sends `mdview/cursor-changed { line, file }` → SPA scrolls preview to nearest heading at-or-before that line.
  - Outline heading click → SPA sends `mdview/heading-clicked { line, file }` → extension moves editor cursor to that line.
  - **Cursor-thrash mitigation:** both sides debounce (50 ms) and tag messages with a short-lived "origin token" so that a click → cursor-move → cursor-changed → outline-scroll → outline-highlight cycle is broken: the SPA suppresses its outbound `mdview/heading-clicked` for 200 ms after receiving a `mdview/cursor-changed`, and the extension suppresses its outbound `mdview/cursor-changed` for 200 ms after receiving a `mdview/heading-clicked`.
  - **Line-base convention:** `data-source-line` on rendered headings is the **0-based line number in the original file** (already adjusted by the server for frontmatter offset). Both sides exchange file-line numbers; no arithmetic on either side. This is a CLI prereq tracked in §18.
- **Reverse scroll-spy** (preview scroll → editor cursor) is deferred to v0.2.
- **External links** (`http://`, `https://`) still open in the user's default browser.

## 7. Theming

The preview matches VS Code's active color theme by default.

- VS Code exposes four theme kinds: `Light`, `Dark`, `HighContrast`, `HighContrastLight`. The extension subscribes to `onDidChangeActiveColorTheme` (debounced 100 ms) and on every change emits `mdview/palette-changed` to the SPA. The SPA swaps palette client-side; no server restart, no `.mdview.json` rewrite.
- Mapping (all palettes already exist in the CLI per `src/shared/types.ts`):
  - `Light` → `paper`
  - `Dark` → `nord`
  - `HighContrast` → `high-contrast`
  - `HighContrastLight` → `high-contrast` (no light HC palette in the CLI yet; safe fallback)
- Users can override via the `mdview.palette` setting; an explicit user value always wins.

## 8. Buffer vs. disk — saved-only for v0.1

The preview reflects file contents **as written to disk**. Unsaved buffer edits do not appear until save.

- Reason: matches the CLI's chokidar-driven model with zero new surface.
- Workaround for users wanting live preview: enable VS Code autosave. Documented in the extension README.
- Unsaved-buffer mode (push buffer content into a new CLI endpoint) is a possible follow-up.

## 9. Defaults applied without further discussion

- The extension surfaces CLI errors (spawn failure, port collision, missing dep) via VS Code notifications and a dedicated `mdview` output channel — not via terminal-formatted hints.
- The extension passes `--no-open` to the spawned CLI (implied by `--vscode`).
- All `mdview` commands are disabled with a graceful message when no workspace folder is open.
- The CLI's chokidar watcher continues to run; the extension does not replace it with VS Code's watcher.

## 10. CLI distribution — bundle

The extension **bundles** `@hardikg/mdview` as a runtime dependency inside the VSIX.

- The CLI is added to the extension's `package.json` `dependencies`. `vsce package` walks the install tree and includes the dependency closure.
- **Footprint:** the published `@hardikg/mdview` tarball is 1.9 MB (4.7 MB unpacked), but the full installed runtime closure (fastify, @fastify/static, shiki, markdown-it, chokidar, gray-matter, open, transitive deps) is realistically **15–20 MB on disk**. The VSIX itself (gzipped) is expected to land **6–10 MB**. The implementation plan must prototype with `vsce ls` and `vsce package` before committing to a number.
- **`.vscodeignore` is required.** It excludes: test fixtures, dev tooling, source maps, `*.md` other than the extension's own README, `tsconfig*.json`, `*.test.*`, any CLI repo state that isn't strictly needed at runtime.
- **Spawn target:** the extension spawns `node <bundledCliEntry>` using `process.execPath` (the same Node binary the extension host runs under), not `node` from PATH. This avoids the npm-generated `.cmd` shim on Windows and avoids PATH lookup entirely.
- **Power-users wanting to pin a newer CLI are an explicit non-goal for v0.1.**

## 11. Multi-root workspaces

The extension maintains **one mdview server per workspace folder, started lazily**.

- The extension keeps a `Map<workspaceFolderURI, ServerHandle>`.
- Lazy spawn on first preview from a folder; reuse on subsequent previews.
- Matches the CLI's existing security model (one root per server, enforced by `resolveSafePath`) — no CLI rework.
- `onDidChangeWorkspaceFolders` adds/disposes handles. Reorders are no-ops (map keys by URI).
- **Soft cap:** if a single window accumulates more than 8 live servers in one session (multi-root + repeated session use), the extension logs a warning to the output channel. This protects against runaway file-handle pressure on Windows.

## 12. Configuration

Both `.mdview.json` and `.vscode/settings.json`; `.vscode/settings.json` takes precedence.

- The CLI continues to load `.mdview.json` from the workspace root unchanged.
- The extension declares `mdview.*` keys in VS Code's settings schema (`mdview.preview.openIn`, `mdview.palette`, `mdview.ignore`, `mdview.port`) and reads them via `vscode.workspace.getConfiguration("mdview")`.
- On spawn, the extension passes overrides to the CLI as **command-line flags** (auditable in process trees; no temp-file cleanup).
- `mdview.port` is a "preferred starting port" with auto-fallback (matches the CLI's existing `--port` semantics).
- The CLI's `--palette` flag is added per §18 to support this.

## 13. Lifecycle

Server processes stop **on extension deactivate, workspace-folder removal, or `stdin` close**.

- A spawned server lives for the rest of the VS Code window's session — zero-latency re-opens.
- "Open in browser" tabs keep working while the VS Code window is open.
- **Crash handling:** the extension subscribes to `child.on("exit", ...)`. Unexpected exits surface as a notification with a "Restart mdview" action and a log entry. The map entry is cleared.
- **Extension-host crash safety:** the spawned CLI listens on its stdin for EOF (`process.stdin.on('end', () => process.exit(0))`) so that if the extension host dies and the pipe closes, the CLI exits cleanly instead of orphaning. This is a CLI prereq per §18.
- **Signal handling:** on macOS/Linux the spawned CLI inherits SIGTERM when `child.kill()` is called; the CLI's existing `SIGINT/SIGTERM` shutdown handlers in `src/cli.ts` do cleanup. On Windows there is no real SIGTERM — `child.kill()` is mapped to `TerminateProcess` of the immediate child only. For the v0.1 model (one CLI process, no subprocesses spawned by the CLI), this is sufficient.
- **Node version probe:** on first activation in a window, the extension runs `process.versions.node` against the bundled CLI's `engines.node` requirement (`>=20`). If the host Node is too old, the extension shows an actionable notification and does not spawn. (`process.versions.node` is always defined in the extension host.)

## 14. Repository layout & release coordination

The extension lives in **the same repo as the CLI**, under a sibling directory `apps/vscode/`. **The repo is NOT converted to npm workspaces** for v0.1.

- Reason for not using npm workspaces: converting the existing repo to a workspaces layout would require moving the entire CLI under `apps/cli/` (or making the root simultaneously a workspace root and the CLI package — confusing). For v0.1, the simpler answer is: CLI stays at the repo root unchanged; `apps/vscode/` is a sibling Node project with its own `package.json` and `node_modules`. The CI workflow has two install/build steps (root and `apps/vscode/`).
- The extension's `package.json` declares `@hardikg/mdview` as a regular npm dependency (not a `file:` link). The version is pinned by semver; bumping it is an explicit step in the extension release.
- **ESM/CJS lane:** the extension is **CJS-only** and never imports from `@hardikg/mdview` at compile time. It interacts with the CLI exclusively through `child_process.spawn` + stdio. This avoids ESM/CJS interop complexity entirely. The extension's TS source is bundled to a single CJS file via esbuild for the activation entry.
- **Release ordering:** CLI prereqs ship in **CLI v0.7.0** first to npm. Then the extension v0.1.0 bumps its dependency pin to `^0.7.0` and ships to the VS Code Marketplace.
- Future split into `mdview-vscode` is a documented option once both contracts stabilize (the CLI's spawn-flag and the postMessage protocol).

## 15. Webview loading mechanism

The webview cannot navigate to a URL directly; it loads extension-supplied HTML. The extension uses VS Code's canonical pattern for embedding a local HTTP server inside a webview.

- **Webview creation:** `vscode.window.createWebviewPanel(...)` with options:
  - `enableScripts: true`
  - `retainContextWhenHidden: true` (preserves SPA state when the panel is hidden; cost: memory for large diagrams; UX win: scroll/outline state survives Tab switches)
  - `portMapping: [{ webviewPort: 7331, extensionHostPort: <CLI's ephemeral port> }]`
- **`portMapping`** tells VS Code: requests from inside the webview iframe for `localhost:7331` are routed to the real ephemeral port on whatever host the extension is running on. Under remote dev (SSH/WSL/Codespaces/Dev Containers) VS Code tunnels transparently.
- **`webview.html`** is a small host document set by the extension. It contains:
  - A `<meta http-equiv="Content-Security-Policy">` with the outer CSP (see below)
  - A single `<iframe>` sized at 100% width/height
  - A nonced `<script>` (~30 lines) implementing the relay
- **Iframe `src`:** `http://localhost:7331/?file=<relPath>&embed=vscode`
  - The `?file=` query selects the initial file (unchanged from existing CLI behavior).
  - The `&embed=vscode` query tells the SPA it is embedded.
  - The iframe's literal `src` always uses port **7331** — the *webview-visible* port from `portMapping`. The CLI's actual ephemeral port appears only in the `portMapping` entry passed to `createWebviewPanel`. This separation lets us write the inner SPA without knowing the real port.
- **Outer CSP** (host doc, set by extension): `default-src 'none'; frame-src http://localhost:*; script-src 'nonce-<NONCE>'; style-src 'unsafe-inline'`. The nonce is generated per webview panel (`crypto.randomBytes(16).toString('base64')`) and the relay `<script>` tag is rendered with `nonce="<NONCE>"`. The relay reads its own nonce via `document.currentScript.nonce` if needed (typically it doesn't need to — being inside a nonced tag is sufficient).
- **Inner CSP** (served by CLI under `--vscode`): unchanged from today except `frame-ancestors`. See §18 for the change and its security justification.
- **Origin discovery — handshake-driven:**
  - The host doc (where the relay runs) is at the webview's synthetic origin, which varies across desktop / Codespaces / web. The extension does NOT know that origin at HTML-generation time in a portable way (`webview.cspSource` is a wildcard like `https://*.vscode-cdn.net`, not a single origin).
  - Discovery uses the inbound-first-message pattern: after iframe load, the **extension sends a `mdview/init { webviewPort: 7331 }` message** through the webview message channel. The relay forwards it into the iframe (`iframe.contentWindow.postMessage(msg, "http://localhost:7331")`). The inner SPA receives this and records `parentOrigin = e.origin` — that is the host doc's real origin. From then on the SPA uses `parentOrigin` as `targetOrigin` for all outbound `window.parent.postMessage(...)` calls.
  - Until the SPA receives `mdview/init` and learns `parentOrigin`, it buffers any outbound messages and flushes after the handshake completes.
- **Origin validation — explicit:**
  - **Relay (inbound from iframe):** `e.source === iframe.contentWindow && e.origin === "http://localhost:7331"` → forward via `vscode.postMessage(e.data)`. Anything else dropped silently.
  - **Relay (inbound from extension):** all messages from the extension are trusted (they arrive via VS Code's secure message channel); forward into iframe via `iframe.contentWindow.postMessage(msg, "http://localhost:7331")`.
  - **SPA:** validates `e.origin === parentOrigin` (set by handshake) before handling. Drops messages with mismatched origin.
- **Relay script logic** (host doc, ~30 lines):
  - Captures `acquireVsCodeApi()` once.
  - Listens for `window.message` events; if `e.source === iframe.contentWindow && e.origin === "http://localhost:7331"`, forward `e.data` to extension via `vscode.postMessage(e.data)`. Otherwise drop.
  - Listens for messages from the extension; forwards them into the iframe via `iframe.contentWindow.postMessage(msg, "http://localhost:7331")`.
- **Security note (relay is load-bearing):** the relay's origin/source checks are the trust boundary on the inbound side. The relay sits inside a strict outer CSP with a per-panel nonce; it cannot be tampered with from the iframe side. The extension host receives only messages forwarded by the relay and trusts the relay's filtering. This is acknowledged explicitly so future contributors don't unwittingly relax those checks.
- **Spawn invocation pinned:** the extension spawns the CLI via `child_process.spawn(process.execPath, [bundledCliEntry, ...args], { stdio: ['pipe', 'pipe', 'pipe'] })`. `process.execPath` is the Node binary the extension host runs under; `bundledCliEntry` is `path.join(extensionPath, 'node_modules/@hardikg/mdview/bin/mdview.mjs')` (or the `MDVIEW_CLI_PATH` value in dev-only — see §20.4). `stdio: 'pipe'` is required for the ready signal (stdout) and the stdin-EOF shutdown path (§13).

## 16. SPA ↔ extension message protocol

All messages are JSON `{ type: string, ...payload }`. Type names are namespaced `mdview/`. Unknown types are silently dropped on both sides.

**Extension → SPA** (via `webview.postMessage`, relayed by host into iframe with `targetOrigin: "http://localhost:7331"`):

| Type | Payload | Effect |
|---|---|---|
| `mdview/init` | `{ webviewPort: 7331 }` | First message after iframe load. SPA records `parentOrigin = e.origin` from this message and uses it for all outbound `targetOrigin`. |
| `mdview/set-file` | `{ relPath }` | SPA loads/displays this file |
| `mdview/cursor-changed` | `{ line, file }` | SPA scrolls preview to nearest heading at-or-before this line |
| `mdview/palette-changed` | `{ palette }` | SPA swaps palette client-side |

**SPA → Extension** (via `window.parent.postMessage(msg, parentOrigin)`, relayed out via `vscode.postMessage(...)`):

| Type | Payload | Effect |
|---|---|---|
| `mdview/ready` | `{}` | SPA finished bootstrap; extension may now send queued messages |
| `mdview/internal-link-clicked` | `{ relPath, fromFile }` | Extension opens `relPath` in a VS Code editor tab |
| `mdview/heading-clicked` | `{ line, file }` | Extension moves editor cursor to that line |
| `mdview/error` | `{ message }` | Extension logs to the `mdview` output channel and notifies if severe |

**Bootstrap order:**

1. Extension creates webview with `portMapping: [{ webviewPort: 7331, extensionHostPort: <CLI port> }]`, generates a per-panel CSP nonce.
2. Extension sets `webview.html` (host doc with iframe `src=http://localhost:7331/?file=<relPath>&embed=vscode` and the nonced relay script).
3. Iframe loads; SPA detects embed mode (`window.parent !== window && URLSearchParams(...).get('embed') === 'vscode'`). SPA installs its `window.message` listener but has no `parentOrigin` yet, so it buffers any outbound message attempts.
4. Extension sends `mdview/init { webviewPort: 7331 }` via `panel.webview.postMessage(...)`.
5. Relay forwards `mdview/init` into the iframe (`iframe.contentWindow.postMessage(msg, "http://localhost:7331")`).
6. SPA receives `mdview/init`, sets `parentOrigin = e.origin`, drains its buffered messages with `targetOrigin: parentOrigin`, and posts `mdview/ready` so the extension knows the SPA is wired.
7. Extension starts sending `set-file` / `cursor-changed` / `palette-changed` as needed.

**`?embed=vscode` propagation across SPA-side navigations:** the SPA's internal navigation (anchor-only scrolls; future SPA-internal route changes) must preserve `?embed=vscode` in the URL so a hard reload remains in embed mode. Verified by the client router; tracked as a CLI prereq in §18.

## 17. Manifest, host environment, and edge cases

VS Code manifest declarations (`package.json` of the extension):

- `engines.vscode`: `^1.78.0` — covers `capabilities.untrustedWorkspaces` (added 1.57), `LogOutputChannel` (added 1.74), modern webview message-channel behaviors, and `portMapping` (stable since 1.30). The actual floor is whatever is needed for the newest API used by the implementation; 1.78 is a safe choice that doesn't gratuitously exclude users on older VS Code.
- `extensionKind`: `["workspace"]` — extension runs on the remote in remote-dev scenarios where files live. Webview UI stays local; `portMapping` tunnels traffic. The remote must have Node ≥ 20; the §13 Node-version probe handles older remotes with a notification.
- `capabilities.virtualWorkspaces`: `false` — vscode.dev / github.dev are unsupported (the CLI uses Node `fs`).
- `capabilities.untrustedWorkspaces`: `{ supported: false, description: "mdview spawns a Node process and reads workspace files; requires workspace trust." }`.
- `activationEvents`: `["onCommand:mdview.openPreview", "onCommand:mdview.openInBrowser"]`. Lazy — extension does not load until the user invokes a command. Cold-start latency on first command (Node + Fastify + chokidar boot) may be 1–3 seconds on large workspaces; the extension shows a status-bar item "Starting mdview…" during this window.
- `contributes.commands`: `mdview.openPreview`, `mdview.openInBrowser`.
- `contributes.configuration`: declares `mdview.preview.openIn`, `mdview.palette`, `mdview.ignore`, `mdview.port` with JSON schema (enum / type / description).
- `categories`: `["Other"]`.
- `keywords`: `markdown`, `preview`, `md`, `viewer`.
- `publisher`: TBD — user to claim on the Marketplace.
- `icon`: extension repo to provide a 128×128 PNG; path declared in manifest.

**Multi-window:** each VS Code window's extension host independently activates the extension and spawns its own server on its own ephemeral port. No coordination, no shared state, no port collisions.

**Command coexistence:** VS Code's built-in `markdown.showPreview` is unchanged; mdview commands are independent. Users who want mdview as the default for `Ctrl+Shift+V` can rebind manually.

## 18. CLI prerequisites (ship in CLI v0.7.0)

The extension's v0.1 requires these additive changes in the CLI. They ship together as **CLI v0.7.0** before the extension v0.1.0.

1. **New flag `--vscode`** — opts into "embedded in VS Code" mode. Bundles:
   - **CSP change:** replaces `frame-ancestors 'none'` with `frame-ancestors *` for HTML responses **only when `--vscode` is set**. Default browser users keep `'none'` — no regression. **Security argument:** the loopback bind (`127.0.0.1`) is the real network-layer boundary; `frame-ancestors` is defense-in-depth on top of that. Allowing any framer is acceptable when the page is opt-in (explicit `--vscode` flag), local-only, and only reachable from processes already running on the user's machine. Enumerating webview origins (which vary across desktop/web/Codespaces) is brittle and not portable; `frame-ancestors *` under the flag is the conservative choice that ships. **Auditable trail:** this relaxation is a deliberate, named exception to CLAUDE.md §3.1 — the implementation must include an `// why` comment at the CSP assembly site documenting the flag gate and the security argument so future contributors understand why the constant has two values.
   - Implies `--no-open` (extension owns the URL).
   - Emits the structured ready signal (item 2).
   - Tells the SPA it is embedded.
2. **Structured "ready" signal on stdout** — when the server has bound, the CLI writes one line of JSON like `{"event":"ready","url":"http://127.0.0.1:7331/","port":7331}` to stdout. This replaces (or accompanies) today's `mdview → <url>` and `watching: <root>` human lines (`src/cli.ts:198-199`) under `--vscode`.
3. **New flag `--palette <name>`** — overrides the palette without modifying `.mdview.json`. Accepts the values already enumerated in `src/shared/types.ts`: `classic | paper | nord | solarized | high-contrast`.
4. **`--port 0` support** — the existing parser rejects ports ≤ 0 (`src/cli.ts:74`). Loosen the validation so that `--port 0` means "let the kernel assign an ephemeral port." The actual port is reported via the ready signal (item 2). All existing positive-port behavior is unchanged.
5. **`data-source-line` on rendered headings** — every `<h1>..<h6>` carries `data-source-line="<n>"`, where `n` is the **0-based line number in the source file** (i.e., after re-adding the frontmatter offset that `gray-matter` strips). The renderer in `src/render/markdown.ts` already knows how many lines of frontmatter were removed and adds it to `token.map[0]` before emitting. No regression for browser users; the attribute is harmless if unused.
6. **SPA embed-mode client code** — when `?embed=vscode` is present in the URL:
   - Detects embed mode (`window.parent !== window && URLSearchParams query has embed=vscode`).
   - Hides the file-tree pane.
   - Installs a `window.message` listener immediately on boot.
   - Discovers `parentOrigin` from the first inbound `mdview/init` message (`parentOrigin = e.origin`); buffers any outbound message attempts until this is set.
   - Validates `e.origin === parentOrigin` on every subsequent inbound message; drops on mismatch.
   - Handles `mdview/init`, `mdview/set-file`, `mdview/cursor-changed`, `mdview/palette-changed`.
   - Routes internal-link clicks (`[data-internal-link]`) through `window.parent.postMessage({type: 'mdview/internal-link-clicked', ...}, parentOrigin)` instead of in-app navigation.
   - Routes outline-heading clicks through `window.parent.postMessage({type: 'mdview/heading-clicked', ...}, parentOrigin)`.
   - After receiving `mdview/init`, emits `mdview/ready`.
   - Preserves `?embed=vscode` across all SPA-internal navigation (router must never strip it).
7. **Graceful shutdown on stdin EOF** — the CLI registers `process.stdin.on('end', () => process.exit(0))` (and equivalent on stdin error) so that if the extension host dies and the pipe closes, the CLI exits cleanly instead of orphaning. Today the CLI does not consume stdin; this is purely additive. No regression for browser users (stdin stays open under a terminal).

No changes touch `resolveSafePath`, the watcher, the asset allow-list, route handlers' input validation, or pattern-matching ReDoS guards. The CSP change is gated by `--vscode` and scoped to `frame-ancestors`.

## 19. Out of scope for v0.1

- Editing markdown inside the preview.
- Re-implementing rendering in a webview.
- Replacing or disabling VS Code's built-in markdown preview.
- Telemetry, analytics, or remote network calls.
- Unsaved-buffer live preview.
- Reverse scroll-spy (preview scroll → editor cursor).
- Reference-counted server lifecycle, idle timeouts.
- Open VSX publishing.
- Power-user "bring your own CLI" PATH lookup.
- Virtual-workspace support (vscode.dev / github.dev).
- Untrusted-workspace support.
- Single-file mode (extension requires a workspace folder).
- A light high-contrast palette in the CLI (HighContrastLight maps to the existing high-contrast for v0.1).

## 20. Local development & testing

How to develop and exercise the extension from a fresh checkout.

### 20.1 First-time setup

```bash
# at repo root
npm install
npm run build

# extension subproject
cd apps/vscode
npm install
npm run build
```

### 20.2 Running the extension under the debugger

1. Open the repo at the root in VS Code.
2. Open the Run & Debug panel.
3. Select the **"Run Extension"** launch config (defined in `apps/vscode/.vscode/launch.json`, provided by the implementation plan).
4. Press **F5**.

The launch config is:

```jsonc
{
  "type": "extensionHost",
  "request": "launch",
  "name": "Run Extension",
  "args": [
    "--extensionDevelopmentPath=${workspaceFolder}/apps/vscode",
    "--folder-uri=${workspaceFolder}/test-fixtures"
  ],
  "env": {
    "NODE_ENV": "development"
  },
  "preLaunchTask": "apps/vscode:watch"
}
```

- `--extensionDevelopmentPath` points VS Code at the in-development extension. The published version (if any) is shadowed.
- `--folder-uri` (passed via `args`) opens the Dev Host with the repo's existing `test-fixtures/` folder so previewing is reproducible.
- `NODE_ENV=development` is what `MDVIEW_CLI_PATH` (see §20.4) gates on.
- `preLaunchTask` runs `apps/vscode/`'s esbuild watcher so F5 always sees a fresh bundle.

### 20.3 Iterating on extension code

- Watcher: `cd apps/vscode && npm run watch` (kicked off automatically by `preLaunchTask`).
- After saving extension source, **Cmd+R** (macOS) / **Ctrl+R** (Linux/Windows) in the Dev Host reloads it with the new bundle.

### 20.4 Iterating on CLI code (local CLI override)

Production behavior is to spawn the bundled CLI from `node_modules/@hardikg/mdview/bin/mdview.mjs`. During development, the extension supports a local override:

- The extension reads `process.env.MDVIEW_CLI_PATH` at activation time **only when `process.env.NODE_ENV === "development"`**. The development-only check is enforced via esbuild's `define` substitution at bundle time — in the production build the conditional is constant-folded out, so `MDVIEW_CLI_PATH` cannot influence the production extension regardless of runtime env. This closes the "env-var override ships in production" security hole.
- The launch config (§20.2) sets `NODE_ENV=development`; production VSIX builds set `NODE_ENV=production`.
- To exercise local CLI changes: build the CLI at the repo root (`npm run build`), set `MDVIEW_CLI_PATH=${workspaceFolder}/bin/mdview.mjs` in the launch config's `env`, then F5.
- Alternative: `cd apps/vscode && npm install --no-save ../..` to use `file:..`-linked CLI temporarily. Either works.

### 20.5 Logs & debugging

- **Extension logs:** Output panel → **mdview** channel in the Dev Host window.
- **Webview Developer Tools:** in the Dev Host, command palette → "Developer: Open Webview Developer Tools." Console + Network + DOM for the host doc and the iframe's SPA.
- **Extension debugger:** breakpoints in extension source (set in the original window) are honored.
- **Process tree:** `ps auxf | grep mdview` (POSIX) or `Get-CimInstance Win32_Process | Where-Object CommandLine -like '*mdview*'` (PowerShell) to verify child processes.

### 20.6 Manual smoke checklist before claiming "works"

Run through this in the Dev Host:

- [ ] `mdview: Open Preview` opens a webview docked beside the editor showing the active `.md` file rendered.
- [ ] Saving the file updates the preview within ~1 second.
- [ ] Switching `.md` editor tabs updates the preview.
- [ ] Clicking `[link](./other.md)` in the preview opens `other.md` in a new editor tab; the preview follows.
- [ ] Clicking a heading in the preview's outline moves the editor cursor to that heading.
- [ ] Moving the editor cursor scrolls the preview to the nearest heading.
- [ ] Switching VS Code theme (light ↔ dark) updates the preview palette without restarting the CLI.
- [ ] `mdview: Open in Browser` opens the same URL in the default browser; the browser tab keeps working when the VS Code webview is closed.
- [ ] Closing the VS Code window terminates the child process.
- [ ] Killing the VS Code window from the OS (force-quit) causes the CLI to exit via stdin EOF within a few seconds (no orphan).
- [ ] Opening a non-workspace single file shows a graceful notification.
- [ ] Multi-root workspace: previewing files from two folders spawns two servers; verify with the process inspection commands above.

### 20.7 Automated tests

- **Unit tests** (extension-side pure functions): `apps/vscode/src/` running under `vitest`. Targets: config merging, workspace-folder resolution, message-protocol validation, line-base conversions if any.
- **Extension integration tests:** `@vscode/test-electron` downloads a clean VS Code, launches it with the extension loaded, runs a Mocha suite. Tests:
  - Command registration (the two commands are contributed).
  - Activation event fires when the command runs.
  - CLI spawn produces a ready signal within timeout.
  - Webview HTML structure (iframe + relay nonce + CSP) matches the spec.
  - Message protocol shape via a stub SPA loaded into an actual webview iframe (testing the wire, not the SPA's behavior).
- **Webview iframe behavior** (the SPA's actual rendering and click handling inside the iframe) is **not automatable** with `@vscode/test-electron` — that tooling cannot drive DOM inside the iframe. Those checks stay in §20.6's manual list.
- **CI matrix:** macOS, Linux, Windows.

### 20.8 Packaging & installing locally

```bash
cd apps/vscode
npx vsce ls          # preview what would be included; iterate on .vscodeignore until clean
npx vsce package     # produces apps/vscode/mdview-<version>.vsix
code --install-extension mdview-<version>.vsix
```

`.vscodeignore` for this extension excludes at minimum: `**/*.ts`, `**/*.map`, `**/tsconfig*.json`, `**/.vscode/`, `**/test/**`, `**/tests/**`, `**/*.test.*`, `src/**`, `**/*.md` except `README.md` and `CHANGELOG.md`, `node_modules/**/test/**`, `node_modules/**/*.md`, `node_modules/.cache/**`. Tune by inspecting `vsce ls` output.

## 21. Summary of all decisions

| # | Decision | Section |
|---|---|---|
| 1 | Sidecar wraps the published CLI; no rendering re-implementation | §2 |
| 2 | Default preview = VS Code webview; opt-out command opens in browser | §3 |
| 3 | Server always rooted at the workspace folder; single-file mode out of scope | §4 |
| 4 | Hide the file tree client-side in embed mode; keep the outline | §5 |
| 5 | Editor tab switch updates the preview | §6 |
| 6 | Internal markdown links open in the editor (`[data-internal-link]` driven) | §6 |
| 7 | Outline ↔ editor cursor sync; debounce + suppression window to break loops | §6 |
| 8 | Auto-match VS Code's theme kind (all 4 kinds mapped); user override allowed | §7 |
| 9 | Saved-only preview for v0.1 | §8 |
| 10 | Errors via VS Code notifications + output channel | §9 |
| 11 | Extension passes `--no-open` to the CLI (implied by `--vscode`) | §9, §18 |
| 12 | Commands require a workspace folder | §9 |
| 13 | Extension bundles `@hardikg/mdview` in the VSIX; ~6–10 MB VSIX target; `.vscodeignore` required; spawn via `process.execPath` | §10 |
| 14 | One mdview server per workspace folder, lazy-started; soft cap 8/window | §11 |
| 15 | Config from both `.mdview.json` and `.vscode/settings.json`; latter overrides; passed as flags | §12 |
| 16 | Server stops on deactivate, folder removal, or stdin EOF; Node-version probe at activation | §13 |
| 17 | Same repo, sibling `apps/vscode/`; no npm workspaces; extension is CJS-only; CLI v0.7.0 ships first | §14 |
| 18 | Webview via `portMapping` + iframe + relay script; nonce in outer CSP; `parentOrigin` passed via URL hash | §15 |
| 19 | 8-message postMessage protocol with explicit origin/source validation on both sides; `parentOrigin` discovered via inbound-first-message handshake | §15, §16 |
| 20 | `extensionKind: ["workspace"]`; virtual/untrusted workspaces unsupported; `onCommand` activation; status-bar UX for cold start | §17 |
| 21 | CLI v0.7.0 prereqs (7 items): `--vscode` flag (frame-ancestors *), structured ready stdout, `--palette` flag, `--port 0` support, file-line `data-source-line`, SPA embed-mode client code, stdin-EOF shutdown | §18 |

## 22. Next step

Move to writing the **implementation plan** (exact steps, no code details) using the `writing-plans` skill. The plan will split into two streams: CLI v0.7.0 work (ships first to npm), then extension v0.1.0 work (consumes the released CLI). §20 testing guidance threads through both streams at relevant milestones.
