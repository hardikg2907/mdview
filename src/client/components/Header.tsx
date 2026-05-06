import { Breadcrumbs } from './Breadcrumbs.js';
import {
  IconSun,
  IconMoon,
  IconPanelLeftClose,
  IconPanelLeftOpen,
  IconPanelRightClose,
  IconPanelRightOpen,
} from './Icons.js';
import type { OutlineNode } from '../../shared/types.js';
import { themeSignal, toggleTheme } from '../hooks/useTheme.js';

interface Props {
  outline: OutlineNode[];
  fileName: string | null;
  treeCollapsed: boolean;
  outlineCollapsed: boolean;
  onToggleTree: () => void;
  onToggleOutline: () => void;
}

export function Header({
  outline,
  fileName,
  treeCollapsed,
  outlineCollapsed,
  onToggleTree,
  onToggleOutline,
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
        <Breadcrumbs outline={outline} fileName={fileName} />
      </div>

      <div class="header-right">
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
