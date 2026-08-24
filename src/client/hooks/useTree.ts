import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import type { ProjectConfig, TreeNode, WorkspaceRoot } from '../../shared/types.js';

interface TreeResponse {
  /** Open roots in display order; the first supplies the window-level config. */
  roots: WorkspaceRoot[];
  /**
   * Every relPath is workspace-scoped (`<rootId>/<path>`). With one root open
   * its contents are at the top level; with several, each root is a top-level
   * folder node whose relPath is its bare id.
   */
  tree: TreeNode[];
  config: ProjectConfig | null;
}

export const treeSignal = signal<TreeResponse | null>(null);
export const configSignal = signal<ProjectConfig | null>(null);

async function fetchTree(): Promise<void> {
  const res = await fetch('/api/tree');
  if (!res.ok) return;
  const data = (await res.json()) as TreeResponse;
  treeSignal.value = data;
  configSignal.value = data.config ?? null;
}

export function useTree() {
  useEffect(() => { void fetchTree(); }, []);
  return treeSignal.value;
}

export { fetchTree };
