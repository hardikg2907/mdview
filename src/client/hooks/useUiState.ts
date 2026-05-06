import { useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';

const TREE_KEY = 'mdview-tree-collapsed';
const OUTLINE_KEY = 'mdview-outline-collapsed';

function readBool(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeBool(key: string, v: boolean): void {
  try {
    localStorage.setItem(key, v ? '1' : '0');
  } catch {
    // best-effort
  }
}

export const treeCollapsedSignal = signal<boolean>(readBool(TREE_KEY));
export const outlineCollapsedSignal = signal<boolean>(readBool(OUTLINE_KEY));

export function toggleTreeCollapsed(): void {
  const next = !treeCollapsedSignal.value;
  treeCollapsedSignal.value = next;
  writeBool(TREE_KEY, next);
}

export function toggleOutlineCollapsed(): void {
  const next = !outlineCollapsedSignal.value;
  outlineCollapsedSignal.value = next;
  writeBool(OUTLINE_KEY, next);
}

// Hook for components that just need to subscribe and read.
export function useUiState(): { treeCollapsed: boolean; outlineCollapsed: boolean } {
  // No-op effect ensures Preact tracks signal usage during render.
  useEffect(() => {}, []);
  return {
    treeCollapsed: treeCollapsedSignal.value,
    outlineCollapsed: outlineCollapsedSignal.value,
  };
}
