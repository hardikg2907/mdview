import { useEffect, useRef } from 'preact/hooks';
import { setMainScroller } from './hooks/useScroller.js';
import { useTheme } from './hooks/useTheme.js';
import { usePalette } from './hooks/usePalette.js';
import { useTree, treeSignal } from './hooks/useTree.js';
import { fileSignal, fileLoading, fileError, loadFile } from './hooks/useFile.js';
import { useScrollSpy, activeHeadingId, lockScrollSpy } from './hooks/useScrollSpy.js';
import { useFocusedSection } from './hooks/useFocusedSection.js';
import { useLiveReload } from './hooks/useLiveReload.js';
import { usePathRouting } from './hooks/usePathRouting.js';
import {
  treeCollapsedSignal,
  outlineCollapsedSignal,
  treeWidthSignal,
  outlineWidthSignal,
  minimapSignal,
  toggleTreeCollapsed,
  toggleOutlineCollapsed,
  setTreeWidth,
  setOutlineWidth,
  resetTreeWidth,
  resetOutlineWidth,
  SIDEBAR_WIDTH_MIN,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_COLLAPSE_THRESHOLD,
} from './hooks/useUiState.js';
import { Resizer } from './components/Resizer.js';
import { Minimap } from './components/Minimap.js';
import { FolderTree } from './components/FolderTree.js';
import { Content } from './components/Content.js';
import { Outline } from './components/Outline.js';
import { Header } from './components/Header.js';
import { ReadingProgress } from './components/ReadingProgress.js';
import { Lightbox } from './components/Lightbox.js';
import { ShortcutsPanel } from './components/ShortcutsPanel.js';
import { CommandPalette } from './components/CommandPalette.js';
import { ContentSkeleton } from './components/ContentSkeleton.js';
import { SearchBar } from './components/SearchBar.js';
import { searchOpenSignal, closeSearch } from './hooks/useSearch.js';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js';
import { useAltWheelScroll } from './hooks/useAltWheelScroll.js';
import { IconPanelLeftOpen, IconPanelRightOpen } from './components/Icons.js';
import type { TreeNode } from '../shared/types.js';

function findFirstMd(nodes: TreeNode[]): string | null {
  for (const n of nodes) {
    if (n.type === 'file' && n.isMarkdown) return n.relPath;
    if (n.type === 'dir' && n.children) {
      const sub = findFirstMd(n.children);
      if (sub) return sub;
    }
  }
  return null;
}

export function App() {
  useTheme();
  usePalette();
  const tree = useTree();
  const { currentPath, setCurrentPath, navigate } = usePathRouting();
  const mainRef = useRef<HTMLElement | null>(null);

  const treeCollapsed = treeCollapsedSignal.value;
  const outlineCollapsed = outlineCollapsedSignal.value;
  const treeWidth = treeWidthSignal.value;
  const outlineWidth = outlineWidthSignal.value;

  // First load: if no path and dir-mode, load the first md file
  useEffect(() => {
    const t = treeSignal.value;
    if (!t) return;
    if (t.root.rootKind === 'file') {
      setCurrentPath(t.root.rootRelPath);
      return;
    }
    if (currentPath === null) {
      const first = findFirstMd(t.tree);
      if (first) setCurrentPath(first);
    }
  }, [tree, currentPath]);

  useEffect(() => { void loadFile(currentPath); }, [currentPath]);
  useEffect(() => { closeSearch(); }, [currentPath]);

  // Update browser tab title to reflect the currently-open file.
  useEffect(() => {
    const f = fileSignal.value;
    let name: string | null = null;
    if (f) {
      if (f.title) {
        name = f.title;
      } else if (currentPath) {
        const idx = currentPath.lastIndexOf('/');
        name = idx >= 0 ? currentPath.slice(idx + 1) : currentPath;
      }
    }
    document.title = name ? `${name} | mdview` : 'mdview';
  }, [fileSignal.value, currentPath]);

  // After file loads, restore hash anchor (if any)
  useEffect(() => {
    if (!fileSignal.value || !mainRef.current) return;
    const hash = window.location.hash.slice(1);
    if (hash) {
      requestAnimationFrame(() => {
        const el = document.getElementById(hash);
        el?.scrollIntoView({ behavior: 'auto', block: 'start' });
      });
    } else {
      mainRef.current.scrollTop = 0;
    }
  }, [fileSignal.value]);

  useScrollSpy(mainRef.current);
  useFocusedSection(mainRef.current);
  useEffect(() => { setMainScroller(mainRef.current); }, [mainRef.current]);
  useLiveReload({ currentPath, scrollerRef: mainRef });
  useKeyboardShortcuts({
    outline: fileSignal.value?.outline ?? [],
    onJumpHeading: (id) => handleJump(id),
    navigate: (relPath: string) => navigate(relPath),
  });
  // IDE-style fast scroll: hold Option/Alt while scrolling for ~4x speed.
  useAltWheelScroll(mainRef);

  const handleSelect = (relPath: string) => navigate(relPath);
  const handleInternalNav = (relPath: string, hash: string) => {
    navigate(relPath, hash);
    if (hash) {
      requestAnimationFrame(() => {
        document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
      });
    }
  };
  const handleJump = (id: string) => {
    history.replaceState(history.state, '', `#${id}`);
    lockScrollSpy(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };
  const handleJumpHeading = (id: string | null) => {
    if (id === null) {
      history.replaceState(history.state, '', window.location.pathname + window.location.search);
      activeHeadingId.value = null;
      mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    handleJump(id);
  };

  const file = fileSignal.value;
  const treeData = treeSignal.value;

  const shellClasses = [
    'app-shell',
    treeCollapsed ? 'tree-collapsed' : '',
    outlineCollapsed ? 'outline-collapsed' : '',
  ].filter(Boolean).join(' ');

  const shellStyle = `--tree-width:${treeWidth}px;--outline-width:${outlineWidth}px`;

  const handleCollapseTree = () => {
    resetTreeWidth();
    if (!treeCollapsed) toggleTreeCollapsed();
  };
  const handleCollapseOutline = () => {
    resetOutlineWidth();
    if (!outlineCollapsed) toggleOutlineCollapsed();
  };

  return (
    <div class={shellClasses} style={shellStyle}>
      <aside class="pane-tree" aria-label="File tree">
        {treeCollapsed ? (
          <button
            class="rail-btn"
            aria-label="Expand file tree"
            title="Expand file tree"
            onClick={toggleTreeCollapsed}
          >
            <IconPanelLeftOpen size={15} />
            <span class="rail-label">FILES</span>
          </button>
        ) : (
          treeData && (
            <FolderTree
              tree={treeData.tree}
              currentPath={currentPath}
              onSelect={handleSelect}
            />
          )
        )}
      </aside>

      {!treeCollapsed && (
        <Resizer
          side="left"
          ariaLabel="Resize file tree"
          getCurrent={() => treeWidthSignal.value}
          onResize={setTreeWidth}
          collapseAt={SIDEBAR_COLLAPSE_THRESHOLD}
          onCollapse={handleCollapseTree}
          min={SIDEBAR_WIDTH_MIN}
          max={SIDEBAR_WIDTH_MAX}
        />
      )}

      <header class="pane-header">
        <Header
          outline={file?.outline ?? []}
          fileName={file?.title ?? null}
          treeCollapsed={treeCollapsed}
          outlineCollapsed={outlineCollapsed}
          onToggleTree={toggleTreeCollapsed}
          onToggleOutline={toggleOutlineCollapsed}
          onJumpHeading={handleJumpHeading}
        />
        <ReadingProgress scroller={mainRef.current} trigger={file} />
      </header>

      <main class="pane-main" ref={mainRef as never}>
        {searchOpenSignal.value && (
          <SearchBar
            scroller={mainRef.current}
            fileTrigger={file}
            onOpenFile={handleSelect}
          />
        )}
        {fileLoading.value && !file && <ContentSkeleton />}
        {fileError.value && <div class="status status-error">Error: {fileError.value}</div>}
        {file && <Content file={file} onInternalNavigate={handleInternalNav} />}
        {file && minimapSignal.value && <Minimap outline={file.outline} />}
      </main>

      <Lightbox />
      <ShortcutsPanel />
      <CommandPalette currentPath={currentPath} onSelect={handleSelect} />

      {!outlineCollapsed && (
        <Resizer
          side="right"
          ariaLabel="Resize outline"
          getCurrent={() => outlineWidthSignal.value}
          onResize={setOutlineWidth}
          collapseAt={SIDEBAR_COLLAPSE_THRESHOLD}
          onCollapse={handleCollapseOutline}
          min={SIDEBAR_WIDTH_MIN}
          max={SIDEBAR_WIDTH_MAX}
        />
      )}

      <aside class="pane-outline" aria-label="Outline">
        {outlineCollapsed ? (
          <button
            class="rail-btn"
            aria-label="Expand outline"
            title="Expand outline"
            onClick={toggleOutlineCollapsed}
          >
            <IconPanelRightOpen size={15} />
            <span class="rail-label">OUTLINE</span>
          </button>
        ) : (
          file && <Outline nodes={file.outline} onJump={handleJump} />
        )}
      </aside>
    </div>
  );
}
