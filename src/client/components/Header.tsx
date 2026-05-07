import { Breadcrumbs } from './Breadcrumbs.js';
import {
  IconSun,
  IconMoon,
  IconPanelLeftClose,
  IconPanelLeftOpen,
  IconPanelRightClose,
  IconPanelRightOpen,
  IconKeyboard,
  IconFocus,
  IconMinimap,
} from './Icons.js';
import { PalettePicker } from './PalettePicker.js';
import type { OutlineNode } from '../../shared/types.js';
import { themeSignal, toggleTheme } from '../hooks/useTheme.js';
import { openShortcutsPanel } from '../hooks/useShortcutsPanel.js';
import {
  focusModeSignal,
  minimapSignal,
  toggleFocusMode,
  toggleMinimap,
} from '../hooks/useUiState.js';

interface Props {
  outline: OutlineNode[];
  fileName: string | null;
  treeCollapsed: boolean;
  outlineCollapsed: boolean;
  onToggleTree: () => void;
  onToggleOutline: () => void;
  onJumpHeading: (id: string | null) => void;
}

export function Header({
  outline,
  fileName,
  treeCollapsed,
  outlineCollapsed,
  onToggleTree,
  onToggleOutline,
  onJumpHeading,
}: Props) {
  const theme = themeSignal.value;
  const treeTip = treeCollapsed ? 'Show file tree (⌘B)' : 'Hide file tree (⌘B)';
  const outlineTip = outlineCollapsed ? 'Show outline (⌘.)' : 'Hide outline (⌘.)';
  const themeTip = theme === 'dark' ? 'Switch to light (⌘\\)' : 'Switch to dark (⌘\\)';
  return (
    <div class="header-inner">
      <div class="header-left">
        <button
          class="icon-btn"
          aria-label={treeTip}
          data-tooltip={treeTip}
          data-tooltip-align="left"
          onClick={onToggleTree}
        >
          {treeCollapsed ? <IconPanelLeftOpen /> : <IconPanelLeftClose />}
        </button>
        <span class="brand">mdview</span>
      </div>

      <div class="header-center">
        <Breadcrumbs outline={outline} fileName={fileName} onJump={onJumpHeading} />
      </div>

      <div class="header-right">
        <button
          class={`icon-btn${focusModeSignal.value ? ' is-active' : ''}`}
          aria-label="Toggle focus mode"
          aria-pressed={focusModeSignal.value}
          data-tooltip="Focus mode (f)"
          onClick={toggleFocusMode}
        >
          <IconFocus />
        </button>
        <button
          class={`icon-btn${minimapSignal.value ? ' is-active' : ''}`}
          aria-label="Toggle minimap"
          aria-pressed={minimapSignal.value}
          data-tooltip="Minimap (m)"
          onClick={toggleMinimap}
        >
          <IconMinimap />
        </button>
        <button
          class="icon-btn"
          aria-label="Keyboard shortcuts"
          data-tooltip="Shortcuts (?)"
          onClick={openShortcutsPanel}
        >
          <IconKeyboard />
        </button>
        <PalettePicker />
        <button
          class="icon-btn theme-btn"
          aria-label={themeTip}
          data-tooltip={themeTip}
          onClick={toggleTheme}
        >
          {theme === 'dark' ? <IconSun /> : <IconMoon />}
        </button>
        <button
          class="icon-btn"
          aria-label={outlineTip}
          data-tooltip={outlineTip}
          data-tooltip-align="right"
          onClick={onToggleOutline}
        >
          {outlineCollapsed ? <IconPanelRightOpen /> : <IconPanelRightClose />}
        </button>
      </div>
    </div>
  );
}
