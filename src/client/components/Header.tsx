import type { OutlineNode } from '../../shared/types.js';
import { openShortcutsPanel } from '../hooks/useShortcutsPanel.js';
import { themeSignal, toggleTheme } from '../hooks/useTheme.js';
import { Breadcrumbs } from './Breadcrumbs.js';
import { IconKeyboard, IconMoon, IconSun } from './Icons.js';
import { ViewMenu } from './ViewMenu.js';

interface Props {
  outline: OutlineNode[];
  fileName: string | null;
  onJumpHeading: (id: string | null) => void;
}

export function Header({ outline, fileName, onJumpHeading }: Props) {
  const theme = themeSignal.value;
  const themeTip = theme === 'dark' ? 'Switch to light (⌘\\)' : 'Switch to dark (⌘\\)';
  return (
    <div class="header-inner">
      <div class="header-left">
        <span class="brand">mdview</span>
      </div>

      <div class="header-center">
        <Breadcrumbs outline={outline} fileName={fileName} onJump={onJumpHeading} />
      </div>

      <div class="header-right">
        <ViewMenu />
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
          aria-label="Keyboard shortcuts"
          data-tooltip="Shortcuts (?)"
          data-tooltip-align="right"
          onClick={openShortcutsPanel}
        >
          <IconKeyboard />
        </button>
      </div>
    </div>
  );
}
