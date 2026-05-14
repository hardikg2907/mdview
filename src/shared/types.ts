// src/shared/types.ts

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface OutlineNode {
  id: string;          // anchor id (slug)
  text: string;        // heading text
  level: HeadingLevel;
  children: OutlineNode[];
}

export interface RenderedFile {
  relPath: string;             // path relative to root, forward slashes
  html: string;                // rendered body HTML (no <html>, no <head>)
  outline: OutlineNode[];
  frontmatter: Record<string, unknown> | null;
  title: string | null;        // extracted from H1 or frontmatter.title
  lastModified: number;        // file mtime, milliseconds since epoch
}

export interface TreeNode {
  name: string;
  relPath: string;
  type: 'file' | 'dir';
  children?: TreeNode[];       // dirs only
  isMarkdown?: boolean;        // files: true if .md/.markdown
}

export interface RootInfo {
  rootKind: 'file' | 'dir';
  rootRelPath: string;         // '' for dir mode; the file's relative path for file mode
  rootName: string;            // basename
}

export type WatchEvent =
  | { kind: 'change'; relPath: string }
  | { kind: 'add'; relPath: string }
  | { kind: 'unlink'; relPath: string }
  | { kind: 'config'; relPath: string };

export type Palette = 'classic' | 'paper' | 'nord' | 'solarized' | 'high-contrast';
export const PALETTES: readonly Palette[] = ['classic', 'paper', 'nord', 'solarized', 'high-contrast'];

export type FontFamily = 'serif' | 'sans' | 'mono';

export interface ProjectConfig {
  palette?: Palette;
  fontFamily?: FontFamily;
  lineWidth?: string;
  defaultCollapsed?: {
    tree?: boolean;
    outline?: boolean;
  };
  ignore?: string[];
}
