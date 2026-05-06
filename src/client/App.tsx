import { useEffect, useRef, useState, useCallback } from 'preact/hooks';
import { useTheme } from './hooks/useTheme.js';
import { useTree, treeSignal } from './hooks/useTree.js';
import { fileSignal, fileLoading, fileError, loadFile } from './hooks/useFile.js';
import { useScrollSpy, activeHeadingId } from './hooks/useScrollSpy.js';
import { useSSE } from './hooks/useSSE.js';
import {
  treeCollapsedSignal,
  outlineCollapsedSignal,
  toggleTreeCollapsed,
  toggleOutlineCollapsed,
} from './hooks/useUiState.js';
import { FolderTree } from './components/FolderTree.js';
import { Content } from './components/Content.js';
import { Outline } from './components/Outline.js';
import { Header } from './components/Header.js';
import { ReadingProgress } from './components/ReadingProgress.js';
import { Lightbox } from './components/Lightbox.js';
import { ShortcutsPanel } from './components/ShortcutsPanel.js';
import { ContentSkeleton } from './components/ContentSkeleton.js';
import { SearchBar } from './components/SearchBar.js';
import { searchOpenSignal, closeSearch } from './hooks/useSearch.js';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js';
import { IconPanelLeftOpen, IconPanelRightOpen } from './components/Icons.js';
import type { TreeNode } from '../shared/types.js';

function initialPath(): string | null {
  const sp = new URLSearchParams(window.location.search);
  return sp.get('file');
}

function pushPath(relPath: string, hash = ''): void {
  const url = `?file=${encodeURIComponent(relPath)}${hash}`;
  history.pushState({ file: relPath }, '', url);
}

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
  const tree = useTree();
  const [currentPath, setCurrentPath] = useState<string | null>(initialPath());
  const mainRef = useRef<HTMLElement | null>(null);

  const treeCollapsed = treeCollapsedSignal.value;
  const outlineCollapsed = outlineCollapsedSignal.value;

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

  // Close search whenever the file changes (highlights would be stale)
  useEffect(() => { closeSearch(); }, [currentPath]);

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
  useKeyboardShortcuts({
    outline: fileSignal.value?.outline ?? [],
    onJumpHeading: (id) => handleJump(id),
  });

  // Live reload: re-fetch the current file on change
  const onWatch = useCallback((e: { kind: string; relPath: string }) => {
    if (e.relPath === currentPath) {
      const top = mainRef.current?.scrollTop ?? 0;
      void loadFile(currentPath).then(() => {
        requestAnimationFrame(() => {
          if (mainRef.current) mainRef.current.scrollTop = top;
        });
      });
    }
    if (e.kind === 'add' || e.kind === 'unlink') {
      void fetch('/api/tree').then((r) => r.json()).then((d) => (treeSignal.value = d));
    }
  }, [currentPath]);
  useSSE(onWatch);

  // browser back/forward
  useEffect(() => {
    const onPop = () => setCurrentPath(initialPath());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const handleSelect = (relPath: string) => {
    setCurrentPath(relPath);
    pushPath(relPath);
  };
  const handleInternalNav = (relPath: string, hash: string) => {
    setCurrentPath(relPath);
    pushPath(relPath, hash);
    if (hash) {
      requestAnimationFrame(() => {
        document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
      });
    }
  };
  const handleJump = (id: string) => {
    history.replaceState(history.state, '', `#${id}`);
    activeHeadingId.value = id;
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

  return (
    <div class={shellClasses}>
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
          <SearchBar scroller={mainRef.current} fileTrigger={file} />
        )}
        {fileLoading.value && !file && <ContentSkeleton />}
        {fileError.value && <div class="status status-error">Error: {fileError.value}</div>}
        {file && <Content file={file} onInternalNavigate={handleInternalNav} />}
      </main>

      <Lightbox />
      <ShortcutsPanel />

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
