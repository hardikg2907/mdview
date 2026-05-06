import { useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';
import type { TreeNode, RootInfo } from '../../shared/types.js';

export const treeSignal = signal<{ root: RootInfo; tree: TreeNode[] } | null>(null);

export function useTree() {
  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/tree');
      if (res.ok) treeSignal.value = await res.json();
    })();
  }, []);
  return treeSignal.value;
}
