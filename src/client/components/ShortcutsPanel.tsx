import { useEffect } from 'preact/hooks';
import { shortcutsPanelSignal, closeShortcutsPanel } from '../hooks/useShortcutsPanel.js';

const isMac =
  typeof navigator !== 'undefined' && /mac/i.test(navigator.platform || navigator.userAgent);
const Mod = isMac ? '⌘' : 'Ctrl';

interface Shortcut {
  keys: string[];
  label: string;
}

const GROUPS: Array<{ heading: string; items: Shortcut[] }> = [
  {
    heading: 'Navigation',
    items: [
      { keys: ['j'], label: 'Next heading' },
      { keys: ['k'], label: 'Previous heading' },
      { keys: ['Esc'], label: 'Close search / lightbox / this panel' },
    ],
  },
  {
    heading: 'Find',
    items: [
      { keys: [Mod, 'P'], label: 'Switch file (quick switcher)' },
      { keys: [Mod, 'F'], label: 'Open in-doc search' },
      { keys: ['/'], label: 'Open search (no modifier)' },
      { keys: ['Enter'], label: 'Next match (in search)' },
      { keys: ['⇧', 'Enter'], label: 'Previous match (in search)' },
    ],
  },
  {
    heading: 'View',
    items: [
      { keys: [Mod, 'B'], label: 'Toggle file tree' },
      { keys: [Mod, '.'], label: 'Toggle outline' },
      { keys: [Mod, '\\'], label: 'Toggle theme' },
      { keys: ['?'], label: 'Show this shortcuts panel' },
    ],
  },
];

export function ShortcutsPanel() {
  const open = shortcutsPanelSignal.value;

  useEffect(() => {
    if (!open) return;
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') closeShortcutsPanel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div
      class="shortcuts-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      onClick={closeShortcutsPanel}
    >
      <div class="shortcuts-panel" onClick={(ev) => ev.stopPropagation()}>
        <div class="shortcuts-head">
          <span class="shortcuts-eyebrow">Keyboard shortcuts</span>
          <button
            type="button"
            class="shortcuts-close"
            aria-label="Close shortcuts panel"
            onClick={closeShortcutsPanel}
          >
            ×
          </button>
        </div>
        <div class="shortcuts-body">
          {GROUPS.map((group) => (
            <section key={group.heading} class="shortcuts-group">
              <h3 class="shortcuts-group-title">{group.heading}</h3>
              <ul>
                {group.items.map((item) => (
                  <li key={item.label}>
                    <span class="shortcut-label">{item.label}</span>
                    <span class="shortcut-keys">
                      {item.keys.map((k, i) => (
                        <span key={`${k}-${i}`}>
                          {i > 0 && <span class="shortcut-plus" aria-hidden>+</span>}
                          <kbd>{k}</kbd>
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <div class="shortcuts-foot">
          Press <kbd>Esc</kbd> or click outside to close
        </div>
      </div>
    </div>
  );
}
