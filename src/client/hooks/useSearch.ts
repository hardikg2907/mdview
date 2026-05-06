import { signal } from '@preact/signals';

export const searchOpenSignal = signal<boolean>(false);

export function openSearch(): void {
  searchOpenSignal.value = true;
}

export function closeSearch(): void {
  searchOpenSignal.value = false;
}

export function toggleSearch(): void {
  searchOpenSignal.value = !searchOpenSignal.value;
}
