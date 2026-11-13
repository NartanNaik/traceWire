const base = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
}

const make = (paths) =>
  function Icon(props) {
    return <svg {...base} {...props}>{paths}</svg>
  }

export const IconSun = make(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </>
)
export const IconMoon = make(<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />)
export const IconPlus = make(<path d="M12 5v14M5 12h14" />)
export const IconMinus = make(<path d="M5 12h14" />)
export const IconTrash = make(
  <>
    <path d="M3 6h18" />
    <path d="M8 6V4h8v2" />
    <path d="M19 6l-1 14H6L5 6" />
    <path d="M10 11v6M14 11v6" />
  </>
)
export const IconCopy = make(
  <>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V6a2 2 0 0 1 2-2h9" />
  </>
)
export const IconCheck = make(<path d="M5 12.5l4.5 4.5L19 7.5" />)
export const IconHelp = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1 1-1.1 1.8" />
    <path d="M12 17h.01" />
  </>
)
export const IconImage = make(
  <>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="M21 16l-5-5-8 9" />
  </>
)
export const IconFlag = make(
  <>
    <path d="M5 21V4" />
    <path d="M5 4h11l-2 4 2 4H5" />
  </>
)
export const IconClose = make(<path d="M6 6l12 12M18 6L6 18" />)
export const IconFit = make(<path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4" />)
export const IconMove = make(
  <>
    <path d="M12 3v18M3 12h18" />
    <path d="M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" />
  </>
)
export const IconList = make(
  <>
    <path d="M8 6h12M8 12h12M8 18h12" />
    <path d="M4 6h.01M4 12h.01M4 18h.01" />
  </>
)
export const IconUpload = make(
  <>
    <path d="M12 16V4" />
    <path d="M7 9l5-5 5 5" />
    <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
  </>
)
export const IconLink = make(
  <>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </>
)
export const IconArrowLeft = make(<path d="M19 12H5M11 6l-6 6 6 6" />)

export const IconNote = make(
  <>
    <path d="M5 4h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-8l-4 4v-4H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
    <path d="M8 9h8M8 12h5" />
  </>
)

export const IconSmile = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 14a4 4 0 0 0 7 0" />
    <path d="M9 9.5h.01M15 9.5h.01" />
  </>
)
export const IconReply = make(
  <>
    <path d="M9 7L4 12l5 5" />
    <path d="M4 12h10a6 6 0 0 1 6 6v1" />
  </>
)
export const IconChevronDown = make(<path d="M6 9l6 6 6-6" />)

export const IconUser = make(
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </>
)
export const IconUsers = make(
  <>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
    <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2A6.5 6.5 0 0 1 21.5 20" />
  </>
)
export const IconDownload = make(
  <>
    <path d="M12 4v12" />
    <path d="M7 11l5 5 5-5" />
    <path d="M4 20h16" />
  </>
)
export const IconEdit = make(
  <>
    <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z" />
    <path d="M14 7l3 3" />
  </>
)

export function Logo({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <circle cx="9" cy="22" r="3" fill="#fff" />
      <path d="M11.5 20.2C17 18 15 11 21 10" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      <path d="M20 6.5l5.5 3.3-4.8 4z" fill="#fff" />
    </svg>
  )
}