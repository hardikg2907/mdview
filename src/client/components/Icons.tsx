// Inline SVG icon components. Inherit currentColor.
// Stroke width and viewBox tuned to look balanced at 16px.

interface IconProps {
  size?: number;
  class?: string;
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': 1.6,
  'stroke-linecap': 'round' as const,
  'stroke-linejoin': 'round' as const,
});

export function IconChevronRight({ size = 14, class: cls }: IconProps) {
  return (
    <svg {...base(size)} class={cls} aria-hidden>
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}

export function IconFolder({ size = 16, class: cls }: IconProps) {
  return (
    <svg {...base(size)} class={cls} aria-hidden>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
    </svg>
  );
}

export function IconFolderOpen({ size = 16, class: cls }: IconProps) {
  return (
    <svg {...base(size)} class={cls} aria-hidden>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1H3V7z" />
      <path d="M3 9h18l-2 8a2 2 0 0 1-2 1.5H6A2 2 0 0 1 4 17L3 9z" />
    </svg>
  );
}

export function IconFile({ size = 16, class: cls }: IconProps) {
  return (
    <svg {...base(size)} class={cls} aria-hidden>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z" />
      <polyline points="14 3 14 9 20 9" />
    </svg>
  );
}

export function IconFileMd({ size = 16, class: cls }: IconProps) {
  // Generic doc with a fold + small accent line evoking markdown
  return (
    <svg {...base(size)} class={cls} aria-hidden>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z" />
      <polyline points="14 3 14 9 20 9" />
      <path d="M8 14l2 2 2-3 2 3 2-2" />
    </svg>
  );
}

export function IconSun({ size = 16, class: cls }: IconProps) {
  return (
    <svg {...base(size)} class={cls} aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="5" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="2" y1="12" x2="5" y2="12" />
      <line x1="19" y1="12" x2="22" y2="12" />
      <line x1="4.5" y1="4.5" x2="6.6" y2="6.6" />
      <line x1="17.4" y1="17.4" x2="19.5" y2="19.5" />
      <line x1="4.5" y1="19.5" x2="6.6" y2="17.4" />
      <line x1="17.4" y1="6.6" x2="19.5" y2="4.5" />
    </svg>
  );
}

export function IconMoon({ size = 16, class: cls }: IconProps) {
  return (
    <svg {...base(size)} class={cls} aria-hidden>
      <path d="M21 13.5A8.5 8.5 0 0 1 10.5 3a7 7 0 1 0 10.5 10.5z" />
    </svg>
  );
}

export function IconPanelLeftClose({ size = 16, class: cls }: IconProps) {
  return (
    <svg {...base(size)} class={cls} aria-hidden>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="9" y1="4" x2="9" y2="20" />
      <polyline points="15 9 12 12 15 15" />
    </svg>
  );
}

export function IconPanelLeftOpen({ size = 16, class: cls }: IconProps) {
  return (
    <svg {...base(size)} class={cls} aria-hidden>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="9" y1="4" x2="9" y2="20" />
      <polyline points="13 9 16 12 13 15" />
    </svg>
  );
}

export function IconPanelRightClose({ size = 16, class: cls }: IconProps) {
  return (
    <svg {...base(size)} class={cls} aria-hidden>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="15" y1="4" x2="15" y2="20" />
      <polyline points="9 9 12 12 9 15" />
    </svg>
  );
}

export function IconPanelRightOpen({ size = 16, class: cls }: IconProps) {
  return (
    <svg {...base(size)} class={cls} aria-hidden>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="15" y1="4" x2="15" y2="20" />
      <polyline points="11 9 8 12 11 15" />
    </svg>
  );
}

export function IconKeyboard({ size = 16, class: cls }: IconProps) {
  return (
    <svg {...base(size)} class={cls} aria-hidden>
      <rect x="2" y="6" width="20" height="13" rx="2" />
      <line x1="6" y1="10" x2="6.01" y2="10" />
      <line x1="10" y1="10" x2="10.01" y2="10" />
      <line x1="14" y1="10" x2="14.01" y2="10" />
      <line x1="18" y1="10" x2="18.01" y2="10" />
      <line x1="6" y1="14" x2="6.01" y2="14" />
      <line x1="18" y1="14" x2="18.01" y2="14" />
      <line x1="9" y1="14" x2="15" y2="14" />
    </svg>
  );
}

export function IconPalette({ size = 16, class: cls }: IconProps) {
  return (
    <svg {...base(size)} class={cls} aria-hidden>
      <path d="M12 22a10 10 0 1 1 10-10c0 2.5-2 4-4 4h-2a2 2 0 0 0-2 2v1a3 3 0 0 1-2 3z" />
      <circle cx="6.5" cy="11.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="9.5" cy="7" r="1" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="7" r="1" fill="currentColor" stroke="none" />
      <circle cx="17.5" cy="11.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconFocus({ size = 16, class: cls }: IconProps) {
  return (
    <svg {...base(size)} class={cls} aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

export function IconMinimap({ size = 16, class: cls }: IconProps) {
  return (
    <svg {...base(size)} class={cls} aria-hidden>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <line x1="8" y1="7" x2="14" y2="7" />
      <line x1="8" y1="11" x2="16" y2="11" />
      <line x1="8" y1="15" x2="12" y2="15" />
      <line x1="8" y1="19" x2="14" y2="19" />
    </svg>
  );
}

export function IconList({ size = 16, class: cls }: IconProps) {
  return (
    <svg {...base(size)} class={cls} aria-hidden>
      <line x1="8" y1="6" x2="20" y2="6" />
      <line x1="8" y1="12" x2="20" y2="12" />
      <line x1="8" y1="18" x2="20" y2="18" />
      <circle cx="4" cy="6" r="1" />
      <circle cx="4" cy="12" r="1" />
      <circle cx="4" cy="18" r="1" />
    </svg>
  );
}
