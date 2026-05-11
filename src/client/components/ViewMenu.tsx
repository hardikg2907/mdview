import type { VNode } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  IconSettings,
  IconCheck,
  IconFocus,
  IconMinimap,
  IconMaximize,
} from './Icons.js';
import {
  focusModeSignal,
  minimapSignal,
  wideLayoutSignal,
  toggleFocusMode,
  toggleMinimap,
  toggleWideLayout,
} from '../hooks/useUiState.js';
import { paletteSignal, setPalette } from '../hooks/usePalette.js';
import { PALETTES, type Palette } from '../../shared/types.js';

const PALETTE_LABELS: Record<Palette, string> = {
  classic: 'Classic',
  paper: 'Paper',
  nord: 'Nord',
  solarized: 'Solarized',
  'high-contrast': 'High contrast',
};

interface ToggleRowProps {
  icon: VNode;
  label: string;
  shortcut?: string;
  on: boolean;
  onToggle: () => void;
}

function ToggleRow({ icon, label, shortcut, on, onToggle }: ToggleRowProps) {
  return (
    <button
      class={`view-menu-row${on ? ' is-on' : ''}`}
      role="menuitemcheckbox"
      aria-checked={on}
      onClick={onToggle}
    >
      <span class="view-menu-icon" aria-hidden>{icon}</span>
      <span class="view-menu-label">{label}</span>
      {shortcut && <span class="view-menu-kbd" aria-hidden>{shortcut}</span>}
      <span class="view-menu-check" aria-hidden>
        {on ? <IconCheck size={14} /> : null}
      </span>
    </button>
  );
}

export function ViewMenu() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

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

  const focus = focusModeSignal.value;
  const minimap = minimapSignal.value;
  const wide = wideLayoutSignal.value;
  const currentPalette = paletteSignal.value;

  return (
    <div class="view-menu" ref={wrapRef}>
      <button
        class={`icon-btn${open ? ' is-active' : ''}`}
        aria-label="View settings"
        data-tooltip="View settings"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <IconSettings />
      </button>
      {open && (
        <div class="view-menu-popover" role="menu" aria-label="View settings">
          <div class="view-menu-section">
            <ToggleRow
              icon={<IconFocus size={14} />}
              label="Focus mode"
              shortcut="f"
              on={focus}
              onToggle={toggleFocusMode}
            />
            <ToggleRow
              icon={<IconMinimap size={14} />}
              label="Minimap"
              shortcut="m"
              on={minimap}
              onToggle={toggleMinimap}
            />
            <ToggleRow
              icon={<IconMaximize size={14} />}
              label="Wide layout"
              on={wide}
              onToggle={toggleWideLayout}
            />
          </div>
          <div class="view-menu-divider" />
          <div class="view-menu-section">
            <div class="view-menu-heading">Palette</div>
            {PALETTES.map((p) => (
              <button
                key={p}
                role="menuitemradio"
                aria-checked={currentPalette === p}
                class={`view-menu-row view-menu-palette${currentPalette === p ? ' is-on' : ''}`}
                onClick={() => setPalette(p)}
              >
                <span class={`palette-swatch palette-swatch-${p}`} aria-hidden />
                <span class="view-menu-label">{PALETTE_LABELS[p]}</span>
                <span class="view-menu-check" aria-hidden>
                  {currentPalette === p ? <IconCheck size={14} /> : null}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
