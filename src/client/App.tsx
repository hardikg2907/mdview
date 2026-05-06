import { useTheme } from './hooks/useTheme.js';

export function App() {
  useTheme();
  return (
    <div class="app-shell">
      <aside class="pane-tree">tree</aside>
      <header class="pane-header">header</header>
      <main class="pane-main">
        <article class="markdown-body">main</article>
      </main>
      <aside class="pane-outline">outline</aside>
    </div>
  );
}
