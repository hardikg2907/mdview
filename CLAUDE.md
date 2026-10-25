# CLAUDE.md

Operating instructions for any Claude session (or other agent) working on this repo. The goal: stay aligned with the conventions and invariants the human collaborators rely on, and avoid re-litigating decisions that are already settled.

> User-facing project intent, install, and feature list live in `README.md`. This file is internal — read it first, then read the docs it links to.

---

## 1. What this project is

A **local CLI markdown viewer**. The CLI spawns a Fastify server bound to `127.0.0.1`, opens the browser to a Preact SPA, and streams file-change events over SSE for live reload. It is published to npm and installed globally (`npm i -g <pkg>`); users run it against folders or single `.md` files on their own machine.

Target platforms: **macOS, Linux, Windows.** Node `>=22.12`.

---

## 2. Docs map — read these for context

| File | What it covers | When you must consult it |
|---|---|---|
| `README.md` | User-facing intro, install, quick start, screenshots | Before adding/removing any user-visible flag, command, or feature |
| `docs/ARCHITECTURE.md` | Code layering, where each concern lives, request flow | Before any non-trivial server or client change |
| `docs/FEATURES.md` | Canonical feature list with brief descriptions | When adding/removing a user-visible feature |
| `docs/CONTRIBUTING.md` | Dev workflow, build commands, quality gates, layout | Before your first edit in a session |
| `VERIFICATION.md` | Manual-test checklist (golden-path + edge cases) | Before claiming a change "works" — and to extend when you add new behavior |
| `TODO.md` | Roadmap; phase 2 done, phase 3 (workspaces) + phase 4 (editor extensions) pending | When the user asks "what's next" or "is X planned?" |
| `CHANGELOG.md` | Keep-a-Changelog. `Unreleased` section accumulates between releases | Every change that's user-visible OR security-relevant |
| `LICENSE` | MIT | Only if relicensing |

Skim these before exploring code. They will answer most "where does X live?" questions faster than grep.

---

## 3. Development invariants (do not regress)

### 3.1 Security (these were each fixed deliberately — keep them)

- `markdown-it` is configured with `html: true`. **Every HTML response must carry the CSP set in `src/server/index.ts`.** Do not add a `script-src` source, do not add `'unsafe-inline'` to `script-src`, do not weaken `connect-src 'self'`. `img-src` has no `blob:`; do not add it back without a real user of it. `frame-src` and `object-src` are `'none'`: nothing in the SPA frames a document, and a same-origin frame is how an asset would run as a page. If you need an inline script, find another way.
- **`resolveSafePath` (`src/server/fs/resolve.ts`) is the only sanctioned way to map a `relPath` to an `absPath`.** Never `path.join(root, userInput)` directly. It checks containment twice: lexically, then again after `realpath` on both the root and the target, so a symlink inside a root cannot lead out of it (links that stay inside still work). It returns the real path — read that, not the requested one, and judge extensions on it too (an in-root `notes.md -> .env` must not render). A missing file or dangling link rejects with the filesystem's `ENOENT` (callers answer 404); an escape rejects with `OutsideRootError` (callers answer 400). Do not reintroduce a lexical-only check anywhere.
- **Paths on the wire are workspace-scoped (`<rootId>/<path>`), and `parseWorkspacePath` (`src/server/workspace.ts`) is the only sanctioned way to split one.** It is a lookup against the open-root set, never a parser: an unknown id falls back to the primary root, so it can never widen the filesystem boundary. It does *no* containment checking — the remainder it returns is still untrusted and must go to `resolveSafePath`. Note percent-encoded `../` reaches route params intact (Fastify only collapses raw `../`), so never skip that step.
- **`/__asset/*` serves an allow-list of media extensions only (images, video, audio — no `.txt`, no `.pdf`).** Adding a new extension means adding a real MIME entry in `src/server/routes/api-asset.ts`, and only for a type a rendered document embeds. Do NOT restore the `octet-stream` fallback. Any path segment starting with `.` is a 404, whatever the extension. **Every response from this route — success or error — carries `ASSET_SECURITY_HEADERS`**: a `sandbox` CSP with `default-src 'none'`, `nosniff`, and `cross-origin-resource-policy: same-origin`, applied in the `onSend` hook in `src/server/index.ts` when the matched route or the raw URL is the asset route, and to any `image/svg+xml` response. Check the matched route, not only the raw URL: the router decodes `/%5F%5Fasset/...` onto this route while `req.url` keeps the escapes. An SVG opened as a document runs script under its own headers, not the SPA's; the sandbox is what stops it. Do not key these headers on content type alone, and do not drop `sandbox`.
- **`/api/file` accepts `.md` / `.markdown` / `.mdx` only, up to 16 MB (`MAX_MARKDOWN_BYTES`, else 413).** Do not relax this to read other text formats; serve them as assets if they ever need to be exposed.
- **Folder regex search never runs a user's pattern on the main thread.** `grepFiles` (`src/server/fs/grep.ts`) sends file bodies in batches to a `worker_threads` worker (`src/server/fs/regex-worker.ts`, managed by `regex-runner.ts`), and terminates it when the search's wall-clock budget (3 s) is spent: one backtracking `exec()` cannot be interrupted any other way. The response then carries the partial results with `timedOut: true` and `truncated: true`, and the next search gets a fresh worker. At most two workers run at once and later searches queue, because any rendered document can fire searches through `<img>` tags. Lines over 10,000 characters are skipped in regex mode. Literal queries are escaped and stay on the main thread. The worker file imports Node built-ins only, because it runs as its own entry — `bin/regex-worker.mjs` in the bundle (resolved via `import.meta.url`, shipped by the `bin/*.mjs` entry in `package.json` `files`), and the `.ts` source under vitest. Do not move regex matching back onto the main thread, and do not drop the budget.
- **User-supplied `ignore` basenames in config are tightly validated** (`/^[A-Za-z0-9_.\-+]{1,64}$/`, with `.` and `..` explicitly rejected) before they reach the watcher or tree walker. The comparison is basename equality only — no globs, no regex, no path joining. Do not loosen this to support patterns without a real glob library and the corresponding ReDoS guard.
- **Front matter is YAML only.** `parseFrontmatter` (`src/render/frontmatter.ts`) parses it with js-yaml's default safe schema, a node budget and a character budget. Never add a parser that evaluates code (gray-matter's `---js` engine ran `eval` on the file's front matter), and keep both budgets: YAML aliases are shared references that can expand a tiny block into a huge response or a cycle, and aliases to one long string do it in few nodes.
- **Embed mode (`--vscode`) is gated by a per-launch token, not by `frame-ancestors`.** The webview's `vscode-webview:` parent cannot be named in `frame-ancestors`, so embed mode omits the directive. Instead the extension generates 32 random bytes per spawn (`ServerHandle`) and passes them in `MDVIEW_EMBED_TOKEN` — the environment only, never argv (any local user can read argv with `ps`). The CLI refuses to start `--vscode` without a well-formed token, deletes it from its own environment once read, and never prints it on the ready line, stdout or stderr. `createServer({ embedToken })` then requires it, compared with `crypto.timingSafeEqual`, on every `text/html` response (`?token=`, checked in `onSend` by content type, so the shell, `/index.html` and every SPA fallback are covered) and on every `/api/*` request (`x-mdview-embed-token` header, or `?token=` for the SSE stream); a miss is a plain-text 403. `/__asset/*` and the static bundle stay ungated: an `<img>` cannot carry a header, and CORP `same-origin` already keeps other sites from loading assets. The SPA completes the `mdview/init` handshake only when the message's `token` equals the one in its own boot URL. Every URL the extension or the SPA builds for an embed server — the iframe `src`, "Open in Browser", `pushPath`, the server's `.md` redirect — must keep `token`, or a reload 403s. Do not gate HTML on paths instead of content type, and do not move the token onto argv or into a log line.
- **Server binds to `127.0.0.1` only.** Don't add a `--host 0.0.0.0` flag without an explicit auth story.
- **Every request's `Host` header is checked against a loopback allow-list** (`isAllowedHost`, `src/server/hosts.ts`), in an `onRequest` hook so it covers the API, `/__asset/*`, the SSE stream and the SPA shell alike. This is the DNS-rebinding boundary — the loopback bind does not stop a page the user is already browsing from re-resolving its own domain to 127.0.0.1. Only names that cannot resolve off this machine belong on the list (`localhost`, `*.localhost`, the loopback literals). Do not add a routable name, and do not skip the hook for "internal" routes.
- Treat every user-supplied input — query params, file contents, watch events — as untrusted. Validate length and shape before passing to a regex, the filesystem, or a rendered template.

### 3.2 Cross-platform

- **`relPath` on the wire is forward-slash, always.** Tree, API responses, watcher events, link rewriting all assume `/`. The watcher does `path.sep → '/'` normalization at the emit boundary; tree walking hard-codes `/`. Do not "fix" these with `path.join` — read the comments in `src/server/fs/tree.ts` and `src/server/watcher.ts`.
- **Line splitting must be CRLF-safe.** Use `split(/\r?\n/)`, not `split('\n')`. A Windows-authored `.md` ends every line in `\r` otherwise.
- **`SIGTERM` and `SIGHUP` do not exist on Windows.** `SIGINT` (Ctrl+C) is the only portable shutdown signal. Don't wire critical lifecycle to anything else without a `process.platform !== 'win32'` guard.
- **Platform-specific shell hints** (e.g. `lsof`, `ss`, `netstat`) belong in `portFinderHint` in `src/cli.ts`. Don't put bare `lsof` in error messages.

### 3.3 Code style

- Prefer editing existing files to creating new ones. Reach for `resolveSafePath`, `compilePattern`, `parseFrontmatter`, `renderMarkdown` etc. before writing parallel implementations.
- No comments explaining *what* the code does. Comments may exist to capture *why* a constraint exists (e.g. "this CSP relaxation is needed for KaTeX") or to document an invariant a future contributor might break.
- Don't add error handling or validation for impossible cases. Validate at the boundary (route handlers, CLI arg parsing); trust internal code.
- Don't add feature flags or backwards-compat shims when you can just change the code — this is a CLI, the user installs the new version.

### 3.4 Testing

- All changes must keep `npm test` green. Current count is in `docs/CONTRIBUTING.md`; if you add behavior, add a test.
- Server route changes get integration tests with Fastify `inject()` (see `tests/server/api-asset.test.ts`, `api-file.test.ts`).
- Pure-function changes get unit tests next to the existing ones for that module.
- If something can't be unit-tested (e.g. a browser-only DOM interaction), add it to `VERIFICATION.md` as a manual step.

---

## 4. Quality gate before every commit

```bash
npm run typecheck     # both tsconfigs
npm test              # all vitest suites
npm run build         # vite + tsup must both succeed
npm audit --omit=dev  # 0 vulnerabilities in SHIPPED deps; if not, see §6
```

All four must pass. Don't claim a task done before running them. If you skipped one because it's "obviously fine," you didn't do the task.

For UI changes the gates above prove correctness but not feature parity — also do the relevant `VERIFICATION.md` rows manually in a browser before declaring done.

---

## 5. Versioning and release flow

This is a **semver-versioned npm CLI**. The version semantics are about the *CLI surface and runtime behavior*, not the internal source layout.

### 5.1 When to propose a version bump

You propose a bump *only when the user signals intent to release* — when they say "let's cut a release," "publish this," "bump the version," or similar. **Do not autonomously bump versions during ordinary development.** Every shipped change accumulates in `CHANGELOG.md` under `## [Unreleased]`; the bump happens once, at release time.

### 5.2 Choosing patch / minor / major

The decision is driven by what landed in `Unreleased`:

| Bump | When to choose | Examples |
|---|---|---|
| **patch** (`0.1.1 → 0.1.2`) | Internal-only changes, bug fixes that restore documented behavior, dependency security bumps that don't change behavior, doc updates | Fix off-by-one in scroll-spy; bump `@fastify/static` for an advisory; fix CRLF line splitting |
| **minor** (`0.1.x → 0.2.0`) | New user-visible feature, new CLI flag, new config option in `.mdview.json`, additive API change | Add `--port-range`; add `palette: nord`; add folder-wide search |
| **major** (`0.x → 1.0`, `1.x → 2.0`) | Removed/renamed CLI flag, removed config option, changed default behavior in a way the user must notice, dropped Node version, breaking schema change | Remove `--no-open`; change default port; require Node 22; rename `.mdview.json` |

While at `0.x.y`, semver is loose by convention — a minor bump (`0.1 → 0.2`) is acceptable for a *breaking* change. Once at `1.0.0`, the table above is strict.

### 5.3 Release checklist (run in order)

1. Confirm working tree is clean (`git status`).
2. Run all four quality gates from §4. Stop if any fails.
3. Run the relevant `VERIFICATION.md` rows manually if anything user-visible changed.
4. Review `CHANGELOG.md` `Unreleased`:
   - Are all the user-visible changes since the last tag captured?
   - Is each entry under the right heading (`Added` / `Changed` / `Fixed` / `Security` / `Removed`)?
5. Decide the bump per §5.2; propose it to the user with a one-line rationale.
6. Once the user agrees: edit `package.json` `version`, rename `## [Unreleased]` to `## [X.Y.Z] — YYYY-MM-DD` in `CHANGELOG.md`, add a fresh empty `## [Unreleased]` block above it.
7. `npm pack --dry-run` — confirm: tarball contents match `files` (no source maps, no test fixtures, no `node_modules`); size hasn't ballooned; `name`, `version`, `license`, `repository` look right.
8. Commit with `chore(release): vX.Y.Z` and tag (`git tag vX.Y.Z`).
9. `npm publish --dry-run` first; review output. Only then `npm publish`.
10. Update `TODO.md` if a checklist item was completed by this release.

### 5.4 What does NOT trigger a bump

- Internal refactors with no observable behavior change.
- Adding/changing tests.
- Editing this file or `docs/*` (unless documenting a behavior that itself changed).
- Adding `// why` comments.
- Renaming internal identifiers.

These changes still go in commits, but they don't need a `Unreleased` entry unless a user could observe the difference.

---

## 6. Dependencies and `npm audit`

- **`npm audit --omit=dev` reporting non-zero is a release blocker** — a vulnerability in a dep we ship to users. Resolve it before bumping the version. The gate is scoped to shipped deps on purpose: a `low`/dev-only advisory in a build tool (e.g. `esbuild` reachable only via `tsup`'s dev server, never in the published tarball) does not block, *provided* the only available fix is a `--force`/breaking bump (which §6 forbids). Still fix dev-only advisories when a clean, non-breaking bump exists, and note any knowingly-deferred one in the release PR/notes.
- Bump runtime deps before dev deps; runtime deps ship to users, dev deps don't.
- Bump one dep at a time, run the full quality gate (§4) between each. Don't run `npm audit fix --force` — it batches breaking changes and leaves you with no idea which one regressed.
- Pin via the lockfile (`package-lock.json`); never commit a `package.json` change without the matching lockfile change.
- Any new dep needs justification — what does it replace, and is the install-time cost (size, native build steps) acceptable for an npm CLI users install globally?

---

## 7. Doc-update rules

Update docs *in the same commit* as the code change. Don't ship a feature and rely on "I'll update the docs later."

| You changed… | Update these |
|---|---|
| A user-visible feature (CLI flag, UI affordance, config option) | `README.md`, `docs/FEATURES.md`, `CHANGELOG.md` `Unreleased`, possibly `VERIFICATION.md` |
| Server architecture (new route, new module, layering) | `docs/ARCHITECTURE.md` |
| Build / dev workflow / quality gates | `docs/CONTRIBUTING.md` |
| Security boundary (CSP, asset allow-list, etc.) | `docs/ARCHITECTURE.md` (security section), `CHANGELOG.md` `Security`, and the invariant list in this file (§3.1) |
| Roadmap (item finished, plans shifted) | `TODO.md` |
| Test infrastructure | `docs/CONTRIBUTING.md` quality-gates section |
| Released a version | `CHANGELOG.md` (move Unreleased → tagged section), `package.json`, `TODO.md` if applicable |

If you're about to update code and your change makes a doc statement wrong, fix the doc in the same diff. Stale docs are worse than missing ones because they actively mislead the next reader.

---

## 8. Things to NOT do

- Don't add telemetry, analytics, or any outbound network call from the running CLI. It's a local viewer.
- Don't bind the server to `0.0.0.0` or any non-loopback address without an auth story.
- Don't introduce a database, file-backed state outside `~/.config/mdview/`, or hidden cache directories under the user's working folder. Inside `~/.config/mdview/` the sanctioned files are `config.json`, `workspace.json`, `daemon.json`, `daemon.log` and `daemon.lock` — nothing else without a reason. The directory is `0700` and every file in it `0600`; create and tighten them through `ensurePrivateDir` / `openPrivateAppend` / `writeJsonAtomic` (`src/daemon/state.ts`), since a mode passed at creation does not fix an existing file.
- Don't shell out to system tools (`grep`, `find`, `sed`, `lsof`). All file/text operations are pure Node.
- Don't read or write outside the watched root from the server. `resolveSafePath` enforces this — keep it that way.
- Don't add `// removed X` comments, dead exports kept "just in case," or commented-out code blocks. Delete confidently — git history is the archive.
- Don't add an HTTP endpoint that changes which folders are served. `workspace.json` is the control plane precisely because a browser page can't write files — an endpoint would hand back the CSRF surface that design removes.
- Don't pass the embed token on the command line, print it, or log it — the environment is the only channel, and `--vscode` without it must refuse to start.
- Don't signal the daemon on a pid alone. Pids get recycled; check the recorded `startedAt` against `/api/health` first (`findLiveDaemon`).
- Don't bump the version autonomously. Wait for the release signal from the user.

---

## 9. When you're unsure

- Re-read §3 — most uncertainty is about which invariant applies.
- Check `docs/ARCHITECTURE.md` for "where does this concern live" questions.
- Check `git log -p` on the file you're changing — recent commits often explain the constraints.
- Ask the user before changing a default, removing a flag, or relaxing a security check. These are reversible only if caught quickly.
