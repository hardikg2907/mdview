import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import type { ProjectConfig, RootInfo, TreeNode } from '../../shared/types.js';

interface TreeResponse {
  root: RootInfo;
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
