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

export const IconSaveAs = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 4.8A1.8 1.8 0 0 1 6.8 3h8.7L19 6.5v12.7A1.8 1.8 0 0 1 17.2 21H6.8A1.8 1.8 0 0 1 5 19.2z" />
    <path d="M9 3v4.6h6V3" />
    <path d="M12 21v-5m0 0-2 2m2-2 2 2" />
  </svg>
)

export const IconUndo = (p: P) => (
  <svg {...base(p)}>
    <path d="M9 6.5 4.5 11 9 15.5" />
    <path d="M4.5 11H14a5 5 0 0 1 0 10h-2.5" />
  </svg>
)

export const IconRedo = (p: P) => (
  <svg {...base(p)}>
    <path d="M15 6.5 19.5 11 15 15.5" />
    <path d="M19.5 11H10a5 5 0 0 0 0 10h2.5" />
  </svg>
)

export const IconFind = (p: P) => (
  <svg {...base(p)}>
    <circle cx="10.5" cy="10.5" r="5.6" />
    <path d="m14.8 14.8 4.7 4.7" />
  </svg>
)

export const IconReplace = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 8.2h11" />
    <path d="m12.4 5.6 2.6 2.6-2.6 2.6" />
    <path d="M20 15.8H9" />
    <path d="m11.6 13.2-2.6 2.6 2.6 2.6" />
  </svg>
)

export const IconSettings = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3.1" />
    <path d="M12 3.2v2.4M12 18.4v2.4M3.2 12h2.4M18.4 12h2.4M5.8 5.8l1.7 1.7M16.5 16.5l1.7 1.7M18.2 5.8l-1.7 1.7M7.5 16.5l-1.7 1.7" />
  </svg>
)
