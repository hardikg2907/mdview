import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { ProjectConfig, RootInfo, TreeNode } from '../../shared/types.js';
import { walkFolder } from '../fs/tree.js';
import type { ConfigState } from '../index.js';

/**
 * Apply the CLI palette override as the final layer in the precedence chain:
 * CLI > .mdview.json > global config > defaults. Applied here (not at config
 * load time) so the on-disk `.mdview.json` is never mutated by the override.
 */
function applyOverrides(
  config: ProjectConfig | null,
  paletteOverride: ConfigState['paletteOverride'],
): ProjectConfig | null {
  if (!paletteOverride) return config;
  return { ...(config ?? {}), palette: paletteOverride };
}

export function registerApiTree(
  app: FastifyInstance,
  rootAbsPath: string,
  rootInfo: RootInfo,
  configState: ConfigState,
): void {
  app.get('/api/tree', async (_req, reply) => {
    const config = applyOverrides(configState.current, configState.paletteOverride);
    if (rootInfo.rootKind === 'file') {
      const single: TreeNode[] = [
        {
          name: path.basename(rootInfo.rootRelPath),
          relPath: rootInfo.rootRelPath,
          type: 'file',
          isMarkdown: true,
        },
      ];
      return reply.send({ root: rootInfo, tree: single, config });
    }
    const tree = await walkFolder(rootAbsPath, { ignore: configState.ignoreSet });
    return reply.send({ root: rootInfo, tree, config });
  });
}
