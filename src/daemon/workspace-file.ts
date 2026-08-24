import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { deriveRootId, isValidRootId, type RootSpec } from '../server/workspace.js';
import { readJsonSafe, workspaceFilePath, writeJsonAtomic } from './state.js';

/**
 * Every root holds a live recursive watcher, so the ceiling is real: several
 * large repos at once is where file-descriptor limits and CPU start to bite.
 */
export const MAX_ROOTS = 8;

export interface WorkspaceRootRecord {
  id: string;
  /** Absolute path to the directory being served. */
  path: string;
  name?: string;
  kind: 'file' | 'dir';
  /** For kind:'file', the file's name within `path`. */
  filePath?: string;
}

export interface WorkspaceRecord {
  roots: WorkspaceRootRecord[];
}

function validateRecord(raw: unknown): WorkspaceRootRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !isValidRootId(r.id)) return null;
  if (typeof r.path !== 'string' || !path.isAbsolute(r.path)) return null;
  if (r.kind !== 'file' && r.kind !== 'dir') return null;
  const out: WorkspaceRootRecord = { id: r.id, path: r.path, kind: r.kind };
  if (typeof r.name === 'string' && r.name.length > 0 && r.name.length <= 128) out.name = r.name;
  if (r.kind === 'file') {
    if (typeof r.filePath !== 'string' || r.filePath.length === 0) return null;
    // A single segment only: this is a basename within `path`, and letting a
    // separator through would make it a second traversal surface.
    if (r.filePath.includes('/') || r.filePath.includes('\\')) return null;
    out.filePath = r.filePath;
  }
  return out;
}

/**
 * Read the workspace, dropping anything that doesn't validate.
 *
 * This file is the control plane between the CLI and the daemon, so it is read
 * defensively: a hand-edited or half-written file must degrade to "fewer roots",
 * never to a crash or a path we didn't check.
 */
export function readWorkspace(): WorkspaceRecord {
  const raw = readJsonSafe(workspaceFilePath());
  if (!raw || typeof raw !== 'object') return { roots: [] };
  const list = (raw as Record<string, unknown>).roots;
  if (!Array.isArray(list)) return { roots: [] };
  const seen = new Set<string>();
  const roots: WorkspaceRootRecord[] = [];
  for (const entry of list.slice(0, MAX_ROOTS)) {
    const rec = validateRecord(entry);
    if (!rec || seen.has(rec.id)) continue;
    seen.add(rec.id);
    roots.push(rec);
  }
  return { roots };
}

export function writeWorkspace(record: WorkspaceRecord): void {
  writeJsonAtomic(workspaceFilePath(), record);
}

export function toRootSpecs(record: WorkspaceRecord): RootSpec[] {
  return record.roots.map((r) => ({
    absPath: r.path,
    id: r.id,
    ...(r.name === undefined ? {} : { name: r.name }),
    kind: r.kind,
    ...(r.filePath === undefined ? {} : { filePath: r.filePath }),
  }));
}

export interface ResolvedTarget {
  /** The directory to serve. */
  absPath: string;
  kind: 'file' | 'dir';
  /** For a file target, its basename within absPath. */
  filePath: string;
  /** Display name for a new root. */
  name: string;
}

export function resolveTarget(target: string): ResolvedTarget {
  const abs = path.resolve(target);
  if (!existsSync(abs)) throw new Error(`Path does not exist: ${abs}`);
  const st = statSync(abs);
  if (st.isDirectory()) {
    return { absPath: abs, kind: 'dir', filePath: '', name: path.basename(abs) };
  }
  if (st.isFile()) {
    const dir = path.dirname(abs);
    return { absPath: dir, kind: 'file', filePath: path.basename(abs), name: path.basename(abs) };
  }
  throw new Error(`Unsupported path type: ${abs}`);
}

export interface AddResult {
  /** The root the target now lives under. */
  root: WorkspaceRootRecord;
  /** Workspace path of a specific file to open, or '' for a folder target. */
  filePath: string;
  /** Workspace path prefix to focus when there is no specific file. */
  focusPath: string;
  /** False when the target was already covered by an open root. */
  changed: boolean;
}

/**
 * The open root that already covers `abs`, if any — the most specific one, so
 * a nested root wins over its parent.
 *
 * Containment rather than an exact match: opening a file deep inside a folder
 * you already have open must reuse that folder, not add a second root for its
 * parent directory. Compared via path.relative so a prefix that merely shares
 * characters ("/a/bc" vs "/a/b") can't match.
 */
function findCovering(
  roots: readonly WorkspaceRootRecord[],
  abs: string,
): { root: WorkspaceRootRecord; rel: string } | null {
  let best: { root: WorkspaceRootRecord; rel: string } | null = null;
  for (const root of roots) {
    if (root.kind !== 'dir' && root.path !== abs) continue;
    const rel = path.relative(root.path, abs);
    if (rel.startsWith('..') || path.isAbsolute(rel)) continue;
    if (!best || root.path.length > best.root.path.length) {
      best = { root, rel: rel.split(path.sep).join('/') };
    }
  }
  return best;
}

/**
 * Add a target to the workspace, or reuse the root already serving it.
 *
 * A target inside an open folder never creates a second root — that would show
 * the same files twice in the sidebar. Opening the *parent* of an open root does
 * add one, leaving the two overlapping; that is rarer and harmless, so it isn't
 * special-cased.
 */
export function addRoot(target: string): AddResult {
  const resolved = resolveTarget(target);
  const record = readWorkspace();
  const fullPath =
    resolved.kind === 'file' ? path.join(resolved.absPath, resolved.filePath) : resolved.absPath;

  const covering = findCovering(record.roots, fullPath);
  if (covering) {
    const wsPath = covering.rel
      ? `${covering.root.id}/${covering.rel}`
      : covering.root.id;
    return {
      root: covering.root,
      filePath: resolved.kind === 'file' ? wsPath : '',
      focusPath: resolved.kind === 'file' ? '' : wsPath,
      changed: false,
    };
  }

  if (record.roots.length >= MAX_ROOTS) {
    throw new Error(
      `Workspace is full (${MAX_ROOTS} folders). Close one with 'mdview rm <name>' first.`,
    );
  }

  const id = deriveRootId(resolved.absPath, new Set(record.roots.map((r) => r.id)));
  const root: WorkspaceRootRecord = {
    id,
    path: resolved.absPath,
    kind: resolved.kind,
    ...(resolved.kind === 'file' ? { name: resolved.name, filePath: resolved.filePath } : {}),
  };
  record.roots.push(root);
  writeWorkspace(record);
  return {
    root,
    filePath: resolved.kind === 'file' ? `${id}/${resolved.filePath}` : '',
    focusPath: resolved.kind === 'file' ? '' : id,
    changed: true,
  };
}

/** Remove a root by id or by path. Returns the removed record, or null. */
export function removeRoot(idOrPath: string): WorkspaceRootRecord | null {
  const record = readWorkspace();
  const abs = path.resolve(idOrPath);
  const idx = record.roots.findIndex((r) => r.id === idOrPath || r.path === abs);
  if (idx === -1) return null;
  const [removed] = record.roots.splice(idx, 1);
  writeWorkspace(record);
  return removed ?? null;
}
