import { beforeEach, describe, expect, it } from 'vitest';
import { applyFocus, clearFocus } from '../../src/client/lib/focus-mode.js';

function setup(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = `<div class="markdown-content">${html}</div>`;
  document.body.appendChild(root);
  return root;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('applyFocus', () => {
  it('focuses the heading and its section, dims everything else', () => {
    const root = setup(`
      <h1 id="a">A</h1>
      <p id="p1">in A</p>
      <h2 id="a1">A1</h2>
      <p id="p2">in A1</p>
      <h1 id="b">B</h1>
      <p id="p3">in B</p>
    `);
    applyFocus(root, 'a1');

    const get = (id: string) => root.querySelector(`#${id}`)!;
    // Section: a1 + p2  → focused
    expect(get('a1').classList.contains('is-focused')).toBe(true);
    expect(get('p2').classList.contains('is-focused')).toBe(true);
    // Outside section → dimmed
    expect(get('a').classList.contains('is-dimmed')).toBe(true);
    expect(get('p1').classList.contains('is-dimmed')).toBe(true);
    expect(get('b').classList.contains('is-dimmed')).toBe(true);
    expect(get('p3').classList.contains('is-dimmed')).toBe(true);
  });

  it('section ends at the next heading of equal or shallower level', () => {
    const root = setup(`
      <h2 id="a">A</h2>
      <p id="p1">in A</p>
      <h3 id="a1">A1</h3>
      <p id="p2">in A1</p>
      <h2 id="b">B</h2>
      <p id="p3">in B</p>
    `);
    applyFocus(root, 'a');
    const get = (id: string) => root.querySelector(`#${id}`)!;
    // A's section runs A → end of A1 (h3 is deeper, doesn't terminate)
    expect(get('a').classList.contains('is-focused')).toBe(true);
    expect(get('p1').classList.contains('is-focused')).toBe(true);
    expect(get('a1').classList.contains('is-focused')).toBe(true);
    expect(get('p2').classList.contains('is-focused')).toBe(true);
    // Terminates at next h2 (B)
    expect(get('b').classList.contains('is-dimmed')).toBe(true);
    expect(get('p3').classList.contains('is-dimmed')).toBe(true);
  });

  it('focuses through the end of document when no terminating heading follows', () => {
    const root = setup(`
      <h1 id="a">A</h1>
      <p id="p1">in A</p>
      <p id="p2">also in A</p>
    `);
    applyFocus(root, 'a');
    const get = (id: string) => root.querySelector(`#${id}`)!;
    expect(get('a').classList.contains('is-focused')).toBe(true);
    expect(get('p1').classList.contains('is-focused')).toBe(true);
    expect(get('p2').classList.contains('is-focused')).toBe(true);
  });

  it('clears prior focus markers on every call (idempotent)', () => {
    const root = setup(`
      <h1 id="a">A</h1>
      <p id="p1">in A</p>
      <h1 id="b">B</h1>
      <p id="p2">in B</p>
    `);
    applyFocus(root, 'a');
    applyFocus(root, 'b');

    const a = root.querySelector('#a')!;
    const p1 = root.querySelector('#p1')!;
    const b = root.querySelector('#b')!;
    const p2 = root.querySelector('#p2')!;

    // After re-applying for "b", "a" must no longer be focused.
    expect(a.classList.contains('is-focused')).toBe(false);
    expect(p1.classList.contains('is-focused')).toBe(false);
    expect(a.classList.contains('is-dimmed')).toBe(true);
    expect(p1.classList.contains('is-dimmed')).toBe(true);
    expect(b.classList.contains('is-focused')).toBe(true);
    expect(p2.classList.contains('is-focused')).toBe(true);
  });

  it('no-ops when activeId is null', () => {
    const root = setup('<h1 id="a">A</h1><p id="p1">x</p>');
    // Pre-mark something so we can verify we still cleared it.
    root.querySelector('#a')!.classList.add('is-focused');
    applyFocus(root, null);
    expect(root.querySelector('#a')!.classList.contains('is-focused')).toBe(false);
    expect(root.querySelector('#p1')!.classList.contains('is-dimmed')).toBe(false);
  });

  it('no-ops when the heading id does not exist', () => {
    const root = setup('<h1 id="a">A</h1><p id="p1">x</p>');
    applyFocus(root, 'does-not-exist');
    expect(root.querySelector('#a')!.classList.contains('is-focused')).toBe(false);
    expect(root.querySelector('#p1')!.classList.contains('is-dimmed')).toBe(false);
  });

  it('no-ops when the matched element is not a heading', () => {
    const root = setup('<p id="a">not a heading</p><p id="p1">x</p>');
    applyFocus(root, 'a');
    expect(root.querySelector('#a')!.classList.contains('is-focused')).toBe(false);
    expect(root.querySelector('#p1')!.classList.contains('is-dimmed')).toBe(false);
  });
});

describe('clearFocus', () => {
  it('removes is-focused and is-dimmed classes', () => {
    const root = setup(`
      <h1 id="a">A</h1><p id="p1">x</p><h1 id="b">B</h1>
    `);
    applyFocus(root, 'a');
    clearFocus(root);
    expect(root.querySelectorAll('.is-focused, .is-dimmed').length).toBe(0);
  });
});
