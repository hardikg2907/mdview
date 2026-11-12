import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { flattenMdRelPaths } from '../../shared/tree-utils.js';
import type { Palette, ProjectConfig, TreeNode } from '../../shared/types.js';
import { walkFolder } from '../fs/tree.js';
import { type CachedRootTree, type RootState, toWorkspacePath } from '../workspace.js';

/**
 * Apply the CLI palette override as the final layer in the precedence chain:
 * CLI > .mdview.json > global config > defaults. Applied here (not at config
 * load time) so the on-disk `.mdview.json` is never mutated by the override.
 */
function applyOverrides(
  config: ProjectConfig | null,
  paletteOverride: Palette | undefined,
): ProjectConfig | null {
  if (!paletteOverride) return config;
  return { ...(config ?? {}), palette: paletteOverride };
}

/**
 * Walk (or return cached) folder tree + unprefixed markdown path list for a
 * directory root. Caching only activates once the root's chokidar watcher has
 * finished its initial scan so early file creations cannot slip past invalidation.
 */
export async function loadRootTree(state: RootState): Promise<CachedRootTree> {
  if (state.liveWatcher && state.treeCache) return state.treeCache;
  if (state.treeInflight) return state.treeInflight;

  const { id } = state.root;
  const prefixLen = id.length + 1;
  const canCacheAtStart = state.liveWatcher === true;
  const job = walkFolder(state.absPath, { ignore: state.ignoreSet, relBase: id })
    .then((prefixed) => {
      const unprefixedMdPaths = flattenMdRelPaths(prefixed).map((p) => p.slice(prefixLen));
      const built: CachedRootTree = { prefixed, unprefixedMdPaths };
      if (canCacheAtStart && state.liveWatcher && state.treeInflight === job) {
        state.treeCache = built;
      }
      return built;
    })
    .finally(() => {
      if (state.treeInflight === job) state.treeInflight = undefined;
    });

  state.treeInflight = job;
  return job;
}

/** The children of one root, as workspace-scoped nodes. */
async function rootChildren(state: RootState): Promise<TreeNode[]> {
  const { id, kind, filePath } = state.root;
  if (kind === 'file') {
    return [
      {
        name: path.basename(filePath),
        relPath: toWorkspacePath(id, filePath),
        type: 'file',
        isMarkdown: true,
      },
    ];
  }
  const { prefixed } = await loadRootTree(state);
  return prefixed;
}

export function registerApiTree(
  app: FastifyInstance,
  roots: readonly RootState[],
  paletteOverride?: Palette,
): void {
  app.get('/api/tree', async (_req, reply) => {
    // Window-level settings (palette, font, line width) can only have one
    // value, so they come from the first root. Per-root `ignore` is applied
    // where it belongs, in each root's own walk.
    const config = applyOverrides(roots[0]?.config ?? null, paletteOverride);

    // With a single root its contents sit at the top level, exactly as before
    // workspaces existed. A second root is what makes the grouping worth a
    // level of nesting.
    if (roots.length === 1) {
      const only = roots[0]!;
      return reply.send({
        roots: [only.root],
        tree: await rootChildren(only),
        config,
      });
    }

    const tree: TreeNode[] = await Promise.all(
      roots.map(async (state) => ({
        name: state.root.name,
        relPath: state.root.id,
        type: 'dir' as const,
        children: await rootChildren(state),
      })),
    );
    return reply.send({ roots: roots.map((r) => r.root), tree, config });
  });
}
