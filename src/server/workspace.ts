import path from 'node:path';
import type { ProjectConfig, WorkspaceRoot } from '../shared/types.js';
import type { Watcher } from './watcher.js';

/** What the caller asks for; the id and display name are derived from it. */
export interface RootSpec {
  absPath: string;
  /**
   * Stable wire id. Supplied by the caller when it already knows one — the CLI
   * needs it to build the URL it opens, and the workspace file persists it so
   * permalinks survive restarts. Derived from the folder name when absent.
   */
  id?: string;
  /** Defaults to the basename of absPath. */
  name?: string;
  kind: 'file' | 'dir';
  /** For kind:'file', the file's path within absPath. Ignored otherwise. */
  filePath?: string;
}

/** A root the server has actually opened: its wire identity plus its machinery. */
export interface RootState {
  root: WorkspaceRoot;
  absPath: string;
  ignoreSet: ReadonlySet<string>;
  config: ProjectConfig | null;
  watcher: Watcher;
}

// Same shape as the `ignore` entry allow-list: a single path segment, no
// separators, no globs, no whitespace. Root ids reach us inside URLs and are
// compared against a fixed set, so anything outside this class can only ever be
// a miss — but validating keeps the id we *generate* usable as a URL segment.
const ROOT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export function isValidRootId(id: string): boolean {
  return id !== '.' && id !== '..' && ROOT_ID_PATTERN.test(id);
}

/**
 * Pick a stable, URL-safe id for a root from its folder name, disambiguating
 * against ids already in use (`docs`, `docs-2`, …).
 *
 * Callers persist the result rather than recomputing it, so opening or closing
 * an unrelated root never renumbers an existing one — permalinks keep working.
 */
export function deriveRootId(absPath: string, taken: ReadonlySet<string>): string {
  const slug = path
    .basename(absPath)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[^a-z0-9]+/, '')
    .replace(/[-.]+$/, '')
    .slice(0, 64);
  const stem = isValidRootId(slug) ? slug : 'root';
  if (!taken.has(stem)) return stem;
  for (let n = 2; ; n++) {
    const candidate = `${stem.slice(0, 60)}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** Resolve a spec's id: the caller's if it's usable, otherwise one derived from the path. */
export function resolveRootId(spec: RootSpec, taken: ReadonlySet<string>): string {
  if (spec.id && isValidRootId(spec.id) && !taken.has(spec.id)) return spec.id;
  return deriveRootId(spec.absPath, taken);
}

export function describeRoot(spec: RootSpec, id: string): WorkspaceRoot {
  return {
    id,
    name: spec.name ?? path.basename(spec.absPath),
    kind: spec.kind,
    filePath: spec.kind === 'file' ? (spec.filePath ?? '') : '',
  };
}

export interface ResolvedWsPath {
  state: RootState;
  /** Path within that root — still untrusted; hand it to resolveSafePath. */
  rel: string;
}

/**
 * Split a workspace path (`<rootId>/<path>`) into the root it names and the
 * remainder.
 *
 * This is a lookup against the open-root set, not a parser: an id that isn't
 * open cannot select anything. When the first segment isn't a known id the
 * whole string is treated as relative to the primary root, which is what keeps
 * pre-workspace `?file=` links and the VS Code extension — both of which send
 * bare root-relative paths — working unchanged.
 *
 * It performs no containment checking of its own. `rel` is still attacker-
 * controlled and every caller must pass it through resolveSafePath, which is
 * where traversal is rejected.
 */
export function parseWorkspacePath(
  roots: readonly RootState[],
  wsPath: string,
): ResolvedWsPath | null {
  const primary = roots[0];
  if (!primary) return null;
  const trimmed = wsPath.replace(/^\/+/, '');
  const slash = trimmed.indexOf('/');
  const head = slash === -1 ? trimmed : trimmed.slice(0, slash);
  const match = roots.find((r) => r.root.id === head);
  if (!match) return { state: primary, rel: trimmed };
  return { state: match, rel: slash === -1 ? '' : trimmed.slice(slash + 1) };
}

/** Prefix a within-root path with its root id to make it workspace-scoped. */
export function toWorkspacePath(rootId: string, rel: string): string {
  return rel ? `${rootId}/${rel}` : rootId;
}
