import { signal } from '@preact/signals';

export const shortcutsPanelSignal = signal<boolean>(false);

export function openShortcutsPanel(): void {
  shortcutsPanelSignal.value = true;
}

export function closeShortcutsPanel(): void {
  shortcutsPanelSignal.value = false;
}

export function toggleShortcutsPanel(): void {
  shortcutsPanelSignal.value = !shortcutsPanelSignal.value;
}
