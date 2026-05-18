import { useEffect, useMemo } from 'preact/hooks';
import { closeShortcutsPanel, shortcutsPanelSignal } from '../hooks/useShortcutsPanel.js';
import {
  displayOnlyShortcuts,
  type Shortcut,
  type ShortcutGroup,
  shortcuts,
} from '../shortcuts.js';

const GROUP_ORDER: ShortcutGroup[] = ['Navigation', 'Find', 'View'];

function groupShortcuts(all: Shortcut[]): Array<{ heading: ShortcutGroup; items: Shortcut[] }> {
  const map = new Map<ShortcutGroup, Shortcut[]>();
  for (const g of GROUP_ORDER) map.set(g, []);
  for (const s of all) map.get(s.group)?.push(s);
  return GROUP_ORDER.map((heading) => ({ heading, items: map.get(heading) ?? [] }));
}

export function ShortcutsPanel() {
  const open = shortcutsPanelSignal.value;
  const groups = useMemo(
    () => groupShortcuts([...shortcuts, ...displayOnlyShortcuts]),
    [],
  );

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
          {groups.filter((g) => g.items.length > 0).map((group) => (
            <section key={group.heading} class="shortcuts-group">
              <h3 class="shortcuts-group-title">{group.heading}</h3>
              <ul>
                {group.items.map((item) => (
                  <li key={item.id}>
                    <span class="shortcut-label">{item.label}</span>
                    <span class="shortcut-keys">
                      {item.displayKeys.map((k, i) => (
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
