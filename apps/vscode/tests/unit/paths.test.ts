import { describe, it, expect } from 'vitest';
import { toWorkspaceRelPath } from '../../src/editor/paths';

describe('toWorkspaceRelPath', () => {
  it('returns the filename for a file directly inside the folder', () => {
    expect(toWorkspaceRelPath('/workspace', '/workspace/note.md')).toBe('note.md');
  });

  it('returns a forward-slash path for a file in a subdirectory', () => {
    expect(toWorkspaceRelPath('/workspace', '/workspace/docs/guide.md')).toBe('docs/guide.md');
  });

  it('returns null for a file outside the folder', () => {
    expect(toWorkspaceRelPath('/workspace', '/other/note.md')).toBeNull();
  });

  it('returns null when file path equals folder path', () => {
    expect(toWorkspaceRelPath('/workspace', '/workspace')).toBeNull();
  });
});
