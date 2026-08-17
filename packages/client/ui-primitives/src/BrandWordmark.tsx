// Peck Harness brand wordmark: the peck bird + "Peck" in one svg. Ink rides
// currentColor; the bird matches the favicon so the mark reads identically at
// every size.

import type { IconProps } from './icons/props.ts'

/**
 * Render the full brand wordmark.
 * @param props.size - height in px (default 24; width keeps the mark's fixed ratio).
 * @param props.className - extra class for layout placement.
 * @returns the wordmark svg (aria-hidden decorative brand art).
 */
export function BrandWordmark({ size = 24, className }: IconProps) {
  return (
    <svg
      width={(size * 72) / 24}
      height={size}
      className={className}
      viewBox="0 0 72 24"
      fill="none"
      aria-hidden="true"
    >
      {/* Bird (shared with favicon.svg), drawn in a 24x24 cell. */}
      <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="15" cy="6" r="2.5" />
        <circle cx="15.8" cy="5.5" r="0.5" fill="currentColor" stroke="none" />
        <path d="M17.2 7 L19 9.5 L16.5 8.5" />
        <path d="M12.5 8 C9 9, 7 12, 7.5 15 C8 17, 10 18, 12 17.5 L15 16 C17 15, 17.5 12, 16.5 9" />
        <path d="M10 11 C8 10.5, 5.5 11, 4 13 C5.5 12.5, 7.5 12.5, 9 13" />
        <path d="M7.5 15 C5 15.5, 3.5 14.5, 2 15" />
        <path d="M7.5 15.5 C5.5 16.5, 4 16, 2.5 16.5" />
        <path d="M11 17.5 L10.5 21" />
        <path d="M13.5 16.5 L13.5 21" />
        <path d="M9 21 L10.5 21 L12 21" />
        <path d="M12 21 L13.5 21 L15 21" />
      </g>
      {/* "Peck" wordmark; a text node keeps the mark crisp and theme-adaptive
          while staying on currentColor. */}
      <text
        x="27"
        y="17"
        fill="currentColor"
        fontSize="16"
        fontWeight="600"
        fontFamily="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
      >
        Peck
      </text>
    </svg>
  )
}
