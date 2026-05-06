import type { FastifyInstance } from 'fastify';
import path from 'node:path';
import { walkFolder } from '../fs/tree.js';
import type { RootInfo, TreeNode } from '../../shared/types.js';

export function registerApiTree(
  app: FastifyInstance,
  rootAbsPath: string,
  rootInfo: RootInfo,
): void {
  app.get('/api/tree', async (_req, reply) => {
    if (rootInfo.rootKind === 'file') {
      const single: TreeNode[] = [
        {
          name: path.basename(rootInfo.rootRelPath),
          relPath: rootInfo.rootRelPath,
          type: 'file',
          isMarkdown: true,
        },
      ];
      return reply.send({ root: rootInfo, tree: single });
    }
    const tree = await walkFolder(rootAbsPath);
    return reply.send({ root: rootInfo, tree });
  });
}
