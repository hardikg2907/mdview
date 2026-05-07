import { useEffect, useRef, useState } from 'preact/hooks';
import { IconPalette } from './Icons.js';
import { paletteSignal, setPalette } from '../hooks/usePalette.js';
import { PALETTES, type Palette } from '../../shared/types.js';

const LABELS: Record<Palette, string> = {
  classic: 'Classic',
  paper: 'Paper',
  nord: 'Nord',
  solarized: 'Solarized',
};

export function PalettePicker() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const current = paletteSignal.value;

  useEffect(() => {
    if (!open) return;
    function onClickAway(ev: MouseEvent) {
      if (!wrapRef.current?.contains(ev.target as Node)) setOpen(false);
    }
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClickAway);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickAway);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div class="palette-picker" ref={wrapRef}>
      <button
        class="icon-btn"
        aria-label="Theme palette"
        data-tooltip="Theme palette"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <IconPalette />
      </button>
      {open && (
        <div class="palette-menu" role="menu" aria-label="Choose palette">
          {PALETTES.map((p) => (
            <button
              key={p}
              role="menuitemradio"
              aria-checked={current === p}
              class={`palette-menu-item${current === p ? ' is-active' : ''}`}
              onClick={() => {
                setPalette(p);
                setOpen(false);
              }}
            >
              <span class={`palette-swatch palette-swatch-${p}`} aria-hidden />
              <span>{LABELS[p]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
