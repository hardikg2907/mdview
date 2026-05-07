import { signal } from '@preact/signals';

/**
 * Module-level reference to the main scrolling element (the `.pane-main`).
 * Set once at App mount; consumed by keyboard shortcuts and any feature that
 * needs to drive scroll programmatically.
 */
export const mainScrollerSignal = signal<HTMLElement | null>(null);

export function setMainScroller(el: HTMLElement | null): void {
  mainScrollerSignal.value = el;
}
