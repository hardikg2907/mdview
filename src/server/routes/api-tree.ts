import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { RootInfo, TreeNode } from '../../shared/types.js';
import { walkFolder } from '../fs/tree.js';
import type { ConfigState } from '../index.js';

export function registerApiTree(
  app: FastifyInstance,
  rootAbsPath: string,
  rootInfo: RootInfo,
  configState: ConfigState,
): void {
  app.get('/api/tree', async (_req, reply) => {
    const config = configState.current;
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
