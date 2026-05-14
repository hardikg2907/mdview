# CLAUDE.md

Operating instructions for any Claude session (or other agent) working on this repo. The goal: stay aligned with the conventions and invariants the human collaborators rely on, and avoid re-litigating decisions that are already settled.

> User-facing project intent, install, and feature list live in `README.md`. This file is internal — read it first, then read the docs it links to.

---

## 1. What this project is

A **local CLI markdown viewer**. The CLI spawns a Fastify server bound to `127.0.0.1`, opens the browser to a Preact SPA, and streams file-change events over SSE for live reload. It is published to npm and installed globally (`npm i -g <pkg>`); users run it against folders or single `.md` files on their own machine.

Target platforms: **macOS, Linux, Windows.** Node `>=20`.

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

- `markdown-it` is configured with `html: true`. **Every HTML response must carry the CSP set in `src/server/index.ts`.** Do not add a `script-src` source, do not add `'unsafe-inline'` to `script-src`, do not weaken `connect-src 'self'`. If you need an inline script, find another way.
- **`resolveSafePath` (`src/server/fs/resolve.ts`) is the only sanctioned way to map a `relPath` to an `absPath`.** Never `path.join(root, userInput)` directly.
- **`/__asset/*` serves an allow-list of media extensions only.** Adding a new extension means adding a real MIME entry in `src/server/routes/api-asset.ts`. Do NOT restore the `octet-stream` fallback. Refusing dotfiles and source code through this route is the point.
- **`/api/file` accepts `.md` / `.markdown` / `.mdx` only.** Do not relax this to read other text formats; serve them as assets if they ever need to be exposed.
- **Folder regex search must remain bounded.** `pattern.matchAllWithBudget` + the per-line-length cap in `src/server/fs/grep.ts` are ReDoS guards. If you replace them, replace with something stronger (e.g. `re2`), not nothing.
- **User-supplied `ignore` basenames in config are tightly validated** (`/^[A-Za-z0-9_.\-+]{1,64}$/`, with `.` and `..` explicitly rejected) before they reach the watcher or tree walker. The comparison is basename equality only — no globs, no regex, no path joining. Do not loosen this to support patterns without a real glob library and the corresponding ReDoS guard.
- **Server binds to `127.0.0.1` only.** Don't add a `--host 0.0.0.0` flag without an explicit auth story.
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
npm audit             # must report 0 vulnerabilities; if not, see §6
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

- `npm audit` reporting non-zero is a release blocker. Resolve it before bumping the version.
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
- Don't introduce a database, file-backed state outside `~/.config/mdview/` (and only with explicit user buy-in for phase 3), or hidden cache directories under the user's working folder.
- Don't shell out to system tools (`grep`, `find`, `sed`, `lsof`). All file/text operations are pure Node.
- Don't read or write outside the watched root from the server. `resolveSafePath` enforces this — keep it that way.
- Don't add `// removed X` comments, dead exports kept "just in case," or commented-out code blocks. Delete confidently — git history is the archive.
- Don't bump the version autonomously. Wait for the release signal from the user.

---

## 9. When you're unsure

- Re-read §3 — most uncertainty is about which invariant applies.
- Check `docs/ARCHITECTURE.md` for "where does this concern live" questions.
- Check `git log -p` on the file you're changing — recent commits often explain the constraints.
- Ask the user before changing a default, removing a flag, or relaxing a security check. These are reversible only if caught quickly.
