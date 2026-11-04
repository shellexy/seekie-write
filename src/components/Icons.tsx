import type { ComponentProps } from 'react'

type P = ComponentProps<'svg'>

const base = (props: P) => ({
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  ...props,
})

export const IconNew = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)

export const IconOpen = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.2h7A1.5 1.5 0 0 1 19 9.7V11" />
    <path d="M3.6 11h17.2l-1.7 7.2a1.5 1.5 0 0 1-1.5 1.1H5.8a1.5 1.5 0 0 1-1.5-1.2z" />
  </svg>
)

export const IconSave = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 4.8A1.8 1.8 0 0 1 6.8 3h8.7L19 6.5v12.7A1.8 1.8 0 0 1 17.2 21H6.8A1.8 1.8 0 0 1 5 19.2z" />
    <path d="M8.5 3v5.2h6.2V3" />
    <path d="M8 21v-6h8v6" />
  </svg>
)

export const IconSidebar = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="4.5" width="18" height="15" rx="2" />
    <path d="M9.5 4.5v15" />
  </svg>
)

export const IconMinimize = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 12h14" />
  </svg>
)

export const IconMaximize = (p: P) => (
  <svg {...base(p)}>
    <rect x="5.5" y="5.5" width="13" height="13" rx="1.6" />
  </svg>
)

export const IconRestore = (p: P) => (
  <svg {...base(p)}>
    <rect x="4.5" y="8" width="11.5" height="11.5" rx="1.6" />
    <path d="M8 8V5.9A1.4 1.4 0 0 1 9.4 4.5H18a1.4 1.4 0 0 1 1.4 1.4v8.6A1.4 1.4 0 0 1 18 15.9h-2" />
  </svg>
)

export const IconClose = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)

export const IconChevron = (p: P) => (
  <svg {...base(p)}>
    <path d="m9 6 6 6-6 6" />
  </svg>
)

export const IconWarning = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 4.5 21 20H3z" />
    <path d="M12 10v4.2M12 17.2v.1" />
  </svg>
)
