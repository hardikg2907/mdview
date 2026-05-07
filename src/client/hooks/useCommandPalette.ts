import { signal } from '@preact/signals';

export const paletteOpenSignal = signal<boolean>(false);

export function openPalette(): void {
  paletteOpenSignal.value = true;
}

export function closePalette(): void {
  paletteOpenSignal.value = false;
}

export function togglePalette(): void {
  paletteOpenSignal.value = !paletteOpenSignal.value;
}
