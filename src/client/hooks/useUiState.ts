import { createPersistedBool, createPersistedNumber } from '../lib/persisted-signal.js';

const tree = createPersistedBool('mdview-tree-collapsed', false);
const outline = createPersistedBool('mdview-outline-collapsed', false);
const focusMode = createPersistedBool('mdview-focus-mode', false);
const minimap = createPersistedBool('mdview-minimap', false);

export const focusModeSignal = focusMode.signal;
export const minimapSignal = minimap.signal;

export function toggleFocusMode(): void {
  focusMode.set(!focusMode.signal.value);
}

export function toggleMinimap(): void {
  minimap.set(!minimap.signal.value);
}

export const TREE_WIDTH_DEFAULT = 264;
export const OUTLINE_WIDTH_DEFAULT = 280;
export const SIDEBAR_WIDTH_MIN = 180;
export const SIDEBAR_WIDTH_MAX = 480;
/** If a drag ends below this width, snap to collapsed instead. */
export const SIDEBAR_COLLAPSE_THRESHOLD = 140;

const treeWidth = createPersistedNumber('mdview-tree-width', TREE_WIDTH_DEFAULT, {
  min: SIDEBAR_WIDTH_MIN,
  max: SIDEBAR_WIDTH_MAX,
});
const outlineWidth = createPersistedNumber('mdview-outline-width', OUTLINE_WIDTH_DEFAULT, {
  min: SIDEBAR_WIDTH_MIN,
  max: SIDEBAR_WIDTH_MAX,
});

export const treeCollapsedSignal = tree.signal;
export const outlineCollapsedSignal = outline.signal;
export const treeWidthSignal = treeWidth.signal;
export const outlineWidthSignal = outlineWidth.signal;

export function toggleTreeCollapsed(): void {
  tree.set(!tree.signal.value);
}

export function toggleOutlineCollapsed(): void {
  outline.set(!outline.signal.value);
}

export function setTreeWidth(px: number): void {
  treeWidth.set(px);
}

export function setOutlineWidth(px: number): void {
  outlineWidth.set(px);
}

export function resetTreeWidth(): void {
  treeWidth.set(TREE_WIDTH_DEFAULT);
}

export function resetOutlineWidth(): void {
  outlineWidth.set(OUTLINE_WIDTH_DEFAULT);
}
