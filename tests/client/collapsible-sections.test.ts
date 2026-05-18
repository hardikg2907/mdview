import { beforeEach, describe, expect, it } from 'vitest';
import { currentPathSignal } from '../../src/client/hooks/usePathRouting.js';
import {
  __resetCollapsibleStateForTests,
  collapseAll,
  computeSectionEnd,
  expandAll,
  expandSectionContaining,
  expandSectionContainingElement,
  wireCollapsibleSections,
} from '../../src/client/lib/collapsible-sections.js';
import type { WireContext } from '../../src/client/lib/wire-pipeline.js';

const ctx: WireContext = { onInternalNavigate: () => {} };

function setupRoot(html: string): HTMLElement {
  const container = document.createElement('div');
  const root = document.createElement('div');
  root.className = 'markdown-content';
  root.innerHTML = html.trim();
  container.appendChild(root);
  document.body.appendChild(container);
  return root;
}

function runWire(root: HTMLElement): void {
  void wireCollapsibleSections.run(root, ctx);
}

function clickToggle(root: HTMLElement, headingId: string): void {
  const h = root.querySelector<HTMLHeadingElement>(`#${CSS.escape(headingId)}`)!;
  const btn = h.querySelector<HTMLButtonElement>('button.section-toggle')!;
  btn.click();
}

beforeEach(() => {
  document.body.innerHTML = '';
  __resetCollapsibleStateForTests();
  currentPathSignal.value = '/test.md';
});

describe('computeSectionEnd', () => {
  function levels(seq: string): HTMLElement[] {
    // 'h2 p h3 p h2' -> elements
    return seq.split(/\s+/).map((tag) => document.createElement(tag));
  }

  it('terminates at the next heading of equal level', () => {
    const blocks = levels('h2 p p h2 p');
    expect(computeSectionEnd(blocks, 0)).toBe(3);
  });

  it('terminates at the next heading of shallower level', () => {
    const blocks = levels('h3 p h2 p');
    expect(computeSectionEnd(blocks, 0)).toBe(2);
  });

  it('does not terminate at a deeper-level heading', () => {
    const blocks = levels('h2 p h3 p h2');
    expect(computeSectionEnd(blocks, 0)).toBe(4);
  });

  it('runs to end of document when no terminating heading follows', () => {
    const blocks = levels('h1 p p p');
    expect(computeSectionEnd(blocks, 0)).toBe(4);
  });

  it('returns null for a non-heading index', () => {
    const blocks = levels('h2 p p');
    expect(computeSectionEnd(blocks, 1)).toBeNull();
  });

  it('returns null for out-of-range index', () => {
    const blocks = levels('h2');
    expect(computeSectionEnd(blocks, 5)).toBeNull();
  });
});

describe('wireCollapsibleSections — toggle behavior', () => {
  it('adds a toggle button to every top-level heading with an id', () => {
    const root = setupRoot(`
      <h1 id="a">A</h1>
      <p id="p1">x</p>
      <h2 id="b">B</h2>
      <p id="p2">y</p>
    `);
    runWire(root);
    expect(root.querySelector('#a > button.section-toggle')).not.toBeNull();
    expect(root.querySelector('#b > button.section-toggle')).not.toBeNull();
  });

  it('does not duplicate the toggle button on a second run (idempotent)', () => {
    const root = setupRoot(`<h1 id="a">A</h1><p>x</p>`);
    runWire(root);
    runWire(root);
    expect(root.querySelectorAll('#a > button.section-toggle').length).toBe(1);
  });

  it('skips headings without an id', () => {
    const root = setupRoot(`<h1>NoId</h1><p>x</p>`);
    runWire(root);
    expect(root.querySelector('button.section-toggle')).toBeNull();
  });

  it('collapsing a heading hides every trailing sibling up to the next sibling-or-shallower heading', () => {
    const root = setupRoot(`
      <h2 id="a">A</h2>
      <p id="p1">in A</p>
      <h3 id="a1">A1</h3>
      <p id="p2">in A1</p>
      <h2 id="b">B</h2>
      <p id="p3">in B</p>
    `);
    runWire(root);
    clickToggle(root, 'a');

    expect(root.querySelector('#p1')!.hasAttribute('hidden')).toBe(true);
    expect(root.querySelector('#a1')!.hasAttribute('hidden')).toBe(true);
    expect(root.querySelector('#p2')!.hasAttribute('hidden')).toBe(true);
    // The terminating heading and its content stay visible:
    expect(root.querySelector('#b')!.hasAttribute('hidden')).toBe(false);
    expect(root.querySelector('#p3')!.hasAttribute('hidden')).toBe(false);
    // The heading itself stays visible (only its trailing content hides):
    expect(root.querySelector('#a')!.hasAttribute('hidden')).toBe(false);
  });

  it('toggling twice restores visibility (round-trip)', () => {
    const root = setupRoot(`
      <h1 id="a">A</h1>
      <p id="p1">x</p>
      <h1 id="b">B</h1>
      <p id="p2">y</p>
    `);
    runWire(root);
    clickToggle(root, 'a');
    clickToggle(root, 'a');
    expect(root.querySelector('#p1')!.hasAttribute('hidden')).toBe(false);
  });

  it('reflects collapsed state via aria-expanded on the toggle button', () => {
    const root = setupRoot(`<h1 id="a">A</h1><p id="p1">x</p>`);
    runWire(root);
    const btn = root.querySelector<HTMLButtonElement>('#a > button.section-toggle')!;
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    clickToggle(root, 'a');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(btn.getAttribute('aria-label')).toBe('Expand section');
  });

  it('marks the heading with section-heading-collapsed when collapsed', () => {
    const root = setupRoot(`<h1 id="a">A</h1><p id="p1">x</p>`);
    runWire(root);
    clickToggle(root, 'a');
    expect(
      root.querySelector('#a')!.classList.contains('section-heading-collapsed'),
    ).toBe(true);
    clickToggle(root, 'a');
    expect(
      root.querySelector('#a')!.classList.contains('section-heading-collapsed'),
    ).toBe(false);
  });

  it('does not modify elements that were already hidden by something else', () => {
    const root = setupRoot(`
      <h1 id="a">A</h1>
      <p id="p1" hidden>pre-hidden</p>
      <p id="p2">x</p>
    `);
    runWire(root);
    clickToggle(root, 'a');
    clickToggle(root, 'a'); // re-expand
    // p1 should still be hidden (we didn't hide it, so we don't unhide it).
    expect(root.querySelector('#p1')!.hasAttribute('hidden')).toBe(true);
    // p2 should be visible again.
    expect(root.querySelector('#p2')!.hasAttribute('hidden')).toBe(false);
  });
});

describe('wireCollapsibleSections — state preservation across runs', () => {
  it('preserves collapsed state when wire reruns on the same path (live reload)', () => {
    const root = setupRoot(`
      <h1 id="a">A</h1>
      <p id="p1">x</p>
      <h1 id="b">B</h1>
      <p id="p2">y</p>
    `);
    runWire(root);
    clickToggle(root, 'a');
    expect(root.querySelector('#p1')!.hasAttribute('hidden')).toBe(true);

    // Simulate live reload — innerHTML rewritten, same path.
    root.innerHTML = `
      <h1 id="a">A (edited)</h1>
      <p id="p1">x edited</p>
      <h1 id="b">B</h1>
      <p id="p2">y</p>
    `;
    runWire(root);
    // Section A should still be collapsed.
    expect(root.querySelector('#p1')!.hasAttribute('hidden')).toBe(true);
    const btn = root.querySelector<HTMLButtonElement>('#a > button.section-toggle')!;
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });

  it('clears state when the file path changes', () => {
    const root = setupRoot(`<h1 id="a">A</h1><p id="p1">x</p>`);
    runWire(root);
    clickToggle(root, 'a');

    currentPathSignal.value = '/other.md';
    root.innerHTML = `<h1 id="a">A</h1><p id="p1">x</p>`;
    runWire(root);
    expect(root.querySelector('#p1')!.hasAttribute('hidden')).toBe(false);
  });

  it('drops collapsed-state ids whose headings no longer exist', () => {
    const root = setupRoot(`
      <h1 id="a">A</h1><p id="p1">x</p>
      <h1 id="b">B</h1><p id="p2">y</p>
    `);
    runWire(root);
    clickToggle(root, 'a');
    clickToggle(root, 'b');

    // Live reload removes heading b entirely.
    root.innerHTML = `<h1 id="a">A</h1><p id="p1">x</p>`;
    runWire(root);

    // a still collapsed; b's orphan id has no effect (and shouldn't crash later).
    expect(root.querySelector('#p1')!.hasAttribute('hidden')).toBe(true);
    // Re-adding b on yet another reload should default to expanded.
    root.innerHTML = `
      <h1 id="a">A</h1><p id="p1">x</p>
      <h1 id="b">B</h1><p id="p2">y</p>
    `;
    runWire(root);
    expect(root.querySelector('#p2')!.hasAttribute('hidden')).toBe(false);
  });
});

describe('expandSectionContaining', () => {
  it('expands the collapsed section that contains the target element', () => {
    const root = setupRoot(`
      <h2 id="a">A</h2>
      <p id="p1">x</p>
      <h3 id="a1">A1</h3>
      <p id="p2">inside A1</p>
      <h2 id="b">B</h2>
    `);
    runWire(root);
    clickToggle(root, 'a');
    expect(root.querySelector('#p2')!.hasAttribute('hidden')).toBe(true);

    expandSectionContaining('p2');
    expect(root.querySelector('#p2')!.hasAttribute('hidden')).toBe(false);
    expect(root.querySelector('#p1')!.hasAttribute('hidden')).toBe(false);
  });

  it('no-ops when nothing is collapsed', () => {
    const root = setupRoot(`<h1 id="a">A</h1><p id="p1">x</p>`);
    runWire(root);
    expandSectionContaining('p1'); // shouldn't throw
    expect(root.querySelector('#p1')!.hasAttribute('hidden')).toBe(false);
  });

  it('no-ops for an unknown id', () => {
    const root = setupRoot(`<h1 id="a">A</h1><p id="p1">x</p>`);
    runWire(root);
    clickToggle(root, 'a');
    expandSectionContaining('does-not-exist');
    expect(root.querySelector('#p1')!.hasAttribute('hidden')).toBe(true);
  });
});

describe('expandSectionContainingElement', () => {
  it('expands the section containing a non-id-addressable descendant (e.g. a search match)', () => {
    const root = setupRoot(`
      <h2 id="a">A</h2>
      <p id="p1">x <span class="hit">target</span> y</p>
      <h2 id="b">B</h2>
    `);
    runWire(root);
    clickToggle(root, 'a');
    const hit = root.querySelector<HTMLElement>('.hit')!;
    expect(root.querySelector('#p1')!.hasAttribute('hidden')).toBe(true);
    expandSectionContainingElement(hit);
    expect(root.querySelector('#p1')!.hasAttribute('hidden')).toBe(false);
  });

  it('no-ops when target is null or outside the root', () => {
    const root = setupRoot(`<h1 id="a">A</h1><p id="p1">x</p>`);
    runWire(root);
    clickToggle(root, 'a');
    expandSectionContainingElement(null);
    const outside = document.createElement('span');
    document.body.appendChild(outside);
    expandSectionContainingElement(outside);
    expect(root.querySelector('#p1')!.hasAttribute('hidden')).toBe(true);
  });
});

describe('expandAll / collapseAll', () => {
  it('collapseAll hides every section, expandAll restores them', () => {
    const root = setupRoot(`
      <h1 id="a">A</h1>
      <p id="p1">x</p>
      <h1 id="b">B</h1>
      <p id="p2">y</p>
    `);
    runWire(root);
    collapseAll();
    expect(root.querySelector('#p1')!.hasAttribute('hidden')).toBe(true);
    expect(root.querySelector('#p2')!.hasAttribute('hidden')).toBe(true);

    expandAll();
    expect(root.querySelector('#p1')!.hasAttribute('hidden')).toBe(false);
    expect(root.querySelector('#p2')!.hasAttribute('hidden')).toBe(false);
  });
});

describe('print snapshot / restore', () => {
  it('beforeprint expands every section, afterprint restores the previously-collapsed ones', () => {
    const root = setupRoot(`
      <h1 id="a">A</h1>
      <p id="p1">x</p>
      <h1 id="b">B</h1>
      <p id="p2">y</p>
    `);
    runWire(root);
    clickToggle(root, 'a'); // only A collapsed
    expect(root.querySelector('#p1')!.hasAttribute('hidden')).toBe(true);

    window.dispatchEvent(new Event('beforeprint'));
    expect(root.querySelector('#p1')!.hasAttribute('hidden')).toBe(false);
    expect(root.querySelector('#p2')!.hasAttribute('hidden')).toBe(false);

    window.dispatchEvent(new Event('afterprint'));
    expect(root.querySelector('#p1')!.hasAttribute('hidden')).toBe(true);
    // B was never collapsed by the user, stays expanded after print.
    expect(root.querySelector('#p2')!.hasAttribute('hidden')).toBe(false);
  });

  it('a double beforeprint without afterprint between does not clobber the snapshot', () => {
    const root = setupRoot(`<h1 id="a">A</h1><p id="p1">x</p>`);
    runWire(root);
    clickToggle(root, 'a');

    window.dispatchEvent(new Event('beforeprint'));
    // User dismisses then re-opens the print dialog before afterprint fires:
    window.dispatchEvent(new Event('beforeprint'));
    // Snapshot still records the original collapsed state.
    window.dispatchEvent(new Event('afterprint'));
    expect(root.querySelector('#p1')!.hasAttribute('hidden')).toBe(true);
  });

  it('does nothing useful before the wire has run (activeRoot is null)', () => {
    // Reset to simulate fresh module — no wire has run yet.
    __resetCollapsibleStateForTests();
    // Should not throw.
    window.dispatchEvent(new Event('beforeprint'));
    window.dispatchEvent(new Event('afterprint'));
  });
});
