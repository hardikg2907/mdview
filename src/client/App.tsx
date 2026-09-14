import { useEffect, useRef } from 'preact/hooks';
import { CommandPalette } from './components/CommandPalette.js';
import { Content } from './components/Content.js';
import { ContentSkeleton } from './components/ContentSkeleton.js';
import { FolderTree } from './components/FolderTree.js';
import { Header } from './components/Header.js';
import { IconPanelLeftOpen, IconPanelRightOpen } from './components/Icons.js';
import { Lightbox } from './components/Lightbox.js';
import { Minimap } from './components/Minimap.js';
import { Outline } from './components/Outline.js';
import { ReadingProgress } from './components/ReadingProgress.js';
import { Resizer } from './components/Resizer.js';
import { SearchBar } from './components/SearchBar.js';
import { ShortcutsPanel } from './components/ShortcutsPanel.js';
import { useAltWheelScroll } from './hooks/useAltWheelScroll.js';
import { fileError, fileLoading, fileSignal, loadFile } from './hooks/useFile.js';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js';
import { useLiveReload } from './hooks/useLiveReload.js';
import { paletteSignal, usePalette } from './hooks/usePalette.js';
import { readRootFromUrl, usePathRouting } from './hooks/usePathRouting.js';
import { setMainScroller } from './hooks/useScroller.js';
import { activeHeadingId, lockScrollSpy, useScrollSpy } from './hooks/useScrollSpy.js';
import { closeSearch, searchOpenSignal } from './hooks/useSearch.js';
import { useTheme } from './hooks/useTheme.js';
import { treeSignal, useTree } from './hooks/useTree.js';
import {
  minimapSignal,
  outlineCollapsedSignal,
  outlineWidthSignal,
  resetOutlineWidth,
  resetTreeWidth,
  SIDEBAR_COLLAPSE_THRESHOLD,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
  setOutlineWidth,
  setTreeWidth,
  toggleOutlineCollapsed,
  toggleTreeCollapsed,
  treeCollapsedSignal,
  treeWidthSignal,
  wideLayoutSignal,
} from './hooks/useUiState.js';
import { expandSectionContaining } from './lib/collapsible-sections.js';
import { isEmbedded, postToParent } from './lib/embed.js';
import { findFirstMd, findFirstMdUnder } from './lib/file-search.js';

export function App() {
  useTheme();
  usePalette();
  const tree = useTree();
  const { currentPath, setCurrentPath, navigate } = usePathRouting();
  // Why: in embed mode (VS Code webview) the extension's Explorer pane
  // provides file navigation; showing our own tree would be redundant.
  const embedMode = isEmbedded();
  const mainRef = useRef<HTMLElement | null>(null);

  const treeCollapsed = treeCollapsedSignal.value;
  const outlineCollapsed = outlineCollapsedSignal.value;
  const treeWidth = treeWidthSignal.value;
  const outlineWidth = outlineWidthSignal.value;
  const wideLayout = wideLayoutSignal.value;

  // First load: if no path and dir-mode, load the first md file
  useEffect(() => {
    const t = treeSignal.value;
    if (!t) return;
    // A lone single-file root pins the view — there is nothing else to show.
    const only = t.roots.length === 1 ? t.roots[0] : undefined;
    if (only?.kind === 'file') {
      setCurrentPath(`${only.id}/${only.filePath}`);
      return;
    }
    if (currentPath === null) {
      // `?root=` focuses the folder just opened; without it a second folder
      // would land on whichever root happens to be first.
      const wantRoot = readRootFromUrl();
      const scoped = wantRoot ? findFirstMdUnder(t.tree, wantRoot) : null;
      const first = scoped ?? findFirstMd(t.tree);
      if (first) setCurrentPath(first);
    }
  }, [tree, currentPath]);

  // Refetches on a palette change: code colours are rendered server-side for
  // the active palette only. The light/dark toggle is not in here — both its
  // variants ship in every response, so it repaints with no request.
  useEffect(() => {
    void loadFile(currentPath);
  }, [currentPath, paletteSignal.value]);
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
        expandSectionContaining(hash);
        const el = document.getElementById(hash);
        el?.scrollIntoView({ behavior: 'auto', block: 'start' });
      });
    } else {
      mainRef.current.scrollTop = 0;
    }
  }, [fileSignal.value]);

  useScrollSpy(mainRef.current);
  useEffect(() => { setMainScroller(mainRef.current); }, [mainRef.current]);
  useEffect(() => {
    if (wideLayout) {
      document.documentElement.dataset.wide = '1';
    } else {
      delete document.documentElement.dataset.wide;
    }
  }, [wideLayout]);
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
    if (embedMode && relPath) {
      // Why: in embed mode, internal-link clicks are routed to the extension
      // (which opens the file in a VS Code editor tab) instead of navigating
      // within the SPA. Anchor-only links (#heading) still scroll within the
      // preview because they have an empty relPath.
      postToParent({ type: 'mdview/internal-link-clicked', relPath, fromFile: currentPath ?? '' });
      return;
    }
    navigate(relPath, hash);
    if (hash) {
      const id = hash.slice(1);
      requestAnimationFrame(() => {
        expandSectionContaining(id);
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
      });
    }
  };
  const handleJump = (id: string) => {
    history.replaceState(history.state, '', `#${id}`);
    lockScrollSpy(id);
    expandSectionContaining(id);
    const el = document.getElementById(id);
    el?.scrollIntoView({ behavior: 'smooth' });
    if (embedMode && el) {
      // Why: in embed mode, heading clicks are also relayed to the extension so
      // it can move the VS Code editor cursor to the corresponding line.
      // We read `data-source-line` from the rendered heading element (added in
      // commit d8708d6) rather than the outline node, because OutlineNode has
      // no `line` field and the DOM is the authoritative source for that value.
      const rawLine = el.getAttribute('data-source-line');
      const line = rawLine !== null ? parseInt(rawLine, 10) : null;
      if (line !== null && !Number.isNaN(line)) {
        postToParent({ type: 'mdview/heading-clicked', line, file: currentPath ?? '' });
      }
    }
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

  const minimap = minimapSignal.value;

  const shellClasses = [
    'app-shell',
    embedMode ? 'embed' : '',
    treeCollapsed ? 'tree-collapsed' : '',
    outlineCollapsed ? 'outline-collapsed' : '',
    minimap ? 'has-minimap' : '',
  ].filter(Boolean).join(' ');

  // In embed mode the file tree pane is never rendered, so its grid column must
  // be zero — otherwise it reserves a blank strip on the left.
  const shellStyle =
    `--tree-width:${embedMode ? 0 : treeWidth}px;--outline-width:${outlineWidth}px`;

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
      {!embedMode && (
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
                onCollapse={toggleTreeCollapsed}
              />
            )
          )}
        </aside>
      )}

      {!embedMode && !treeCollapsed && (
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
        {treeData?.roots.length === 0 && (
          <div class="status">
            No folders open. Run <code>mdview &lt;path&gt;</code> in a folder to add one.
          </div>
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
          file && (
            <Outline
              nodes={file.outline}
              onJump={handleJump}
              onCollapse={toggleOutlineCollapsed}
            />
          )
        )}
      </aside>
    </div>
  );
}
