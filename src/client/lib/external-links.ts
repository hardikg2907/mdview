const DANGEROUS_SCHEME_RE = /^(?:javascript|vbscript|data):/i;
const EXTERNAL_URL_RE = /^(?:https?:)?\/\//i;

function stripControlAndSpace(value: string): string {
  let out = '';
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) > 0x20) out += value[i];
  }
  return out;
}

function sanitizeHrefAttr(el: Element, attr: 'href' | 'xlink:href'): string {
  const raw = el.getAttribute(attr);
  if (raw === null) return '';
  if (DANGEROUS_SCHEME_RE.test(stripControlAndSpace(raw))) {
    el.removeAttribute(attr);
    return '';
  }
  return raw.trim();
}

export function markExternalLinks(root: HTMLElement): void {
  const links = root.querySelectorAll('a, area');
  links.forEach((el) => {
    const href = sanitizeHrefAttr(el, 'href') || sanitizeHrefAttr(el, 'xlink:href');

    // Enforce safe window isolation on any raw HTML/SVG link that sets target
    // (prevents <a target="_blank" rel="opener"> tabnabbing and <a target="_top">
    // frame busting in embedded previews).
    const rawTarget = el.getAttribute('target');
    if (rawTarget !== null && rawTarget !== '' && rawTarget.toLowerCase() !== '_self') {
      const lowerTarget = rawTarget.toLowerCase();
      if (lowerTarget === '_top' || lowerTarget === '_parent') {
        el.setAttribute('target', '_blank');
      }
      el.setAttribute('rel', 'noopener noreferrer');
    }

    if (el.hasAttribute('data-internal-link')) return;
    if (!EXTERNAL_URL_RE.test(href)) return;
    if (el.classList.contains('heading-anchor')) return;

    // Use setAttribute so HTMLAnchorElement, SVGAElement, and HTMLAreaElement
    // all work uniformly (SVGAElement.target is a read-only SVGAnimatedString).
    el.setAttribute('target', '_blank');
    el.setAttribute('rel', 'noopener noreferrer');

    if (!(el instanceof HTMLAnchorElement)) return;
    if (el.dataset.externalProcessed === '1') return;

    el.classList.add('is-external');
    if (!el.querySelector('.external-icon')) {
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      icon.setAttribute('class', 'external-icon');
      icon.setAttribute('viewBox', '0 0 12 12');
      icon.setAttribute('width', '11');
      icon.setAttribute('height', '11');
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML =
        '<path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" d="M4.5 2.5h5v5M9.5 2.5L4 8M2.5 5.2v4.3h4.3"/>';
      el.appendChild(icon);
    }
    el.dataset.externalProcessed = '1';
  });
}
