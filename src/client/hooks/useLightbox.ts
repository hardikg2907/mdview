import { signal } from '@preact/signals';

export interface LightboxState {
  src: string;
  alt: string;
}

export const lightboxSignal = signal<LightboxState | null>(null);

export function openLightbox(src: string, alt: string): void {
  lightboxSignal.value = { src, alt };
}

export function closeLightbox(): void {
  lightboxSignal.value = null;
}
