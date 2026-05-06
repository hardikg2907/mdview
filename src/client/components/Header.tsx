import { Breadcrumbs } from './Breadcrumbs.js';
import {
  IconSun,
  IconMoon,
  IconPanelLeftClose,
  IconPanelLeftOpen,
  IconPanelRightClose,
  IconPanelRightOpen,
  IconKeyboard,
} from './Icons.js';
import type { OutlineNode } from '../../shared/types.js';
import { themeSignal, toggleTheme } from '../hooks/useTheme.js';
import { openShortcutsPanel } from '../hooks/useShortcutsPanel.js';

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
  return (
    <div class="header-inner">
      <div class="header-left">
        <button
          class="icon-btn"
          aria-label={treeCollapsed ? 'Show file tree' : 'Hide file tree'}
          title={treeCollapsed ? 'Show file tree' : 'Hide file tree'}
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
          class="icon-btn"
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts (?)"
          onClick={openShortcutsPanel}
        >
          <IconKeyboard />
        </button>
        <button
          class="icon-btn theme-btn"
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          onClick={toggleTheme}
        >
          {theme === 'dark' ? <IconSun /> : <IconMoon />}
        </button>
        <button
          class="icon-btn"
          aria-label={outlineCollapsed ? 'Show outline' : 'Hide outline'}
          title={outlineCollapsed ? 'Show outline' : 'Hide outline'}
          onClick={onToggleOutline}
        >
          {outlineCollapsed ? <IconPanelRightOpen /> : <IconPanelRightClose />}
        </button>
      </div>
    </div>
  );
}
