/**
 * Inline SVG icons for <BugReportButton> — self-contained (no font, no CDN, CSP-safe), stroked
 * with `currentColor` so they inherit the surrounding text/button color. All decorative:
 * `aria-hidden` + `focusable="false"`, with the accessible name carried by the owning control.
 */
import type { JSX } from "react";

interface IconProps {
  /** Rendered square size in px. */
  size?: number;
}

function svgProps(size: number) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
    focusable: "false" as const,
  };
}

/** Friendly line-drawn bug — the launcher + panel-header glyph. */
export function BugIcon({ size = 26 }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size)}>
      <path d="M9 7.5a3 3 0 0 1 6 0" />
      <rect x="7.5" y="7.5" width="9" height="11" rx="4.5" />
      <path d="M12 7.5v11" />
      <path d="M7.5 11 4.5 9.5" />
      <path d="M7.5 15l-3 1.5" />
      <path d="M16.5 11l3-1.5" />
      <path d="M16.5 15l3 1.5" />
      <path d="M9.5 5 8 3.5" />
      <path d="M14.5 5 16 3.5" />
    </svg>
  );
}

/** Close (×) glyph for the panel's dismiss button. */
export function CloseIcon({ size = 18 }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size)} strokeWidth={2}>
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </svg>
  );
}

/** Check glyph inside the success badge. */
export function CheckIcon({ size = 26 }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size)} strokeWidth={2.4}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/** Triangle-warning glyph for the inline error banner. */
export function WarnIcon({ size = 15 }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size)}>
      <path d="M12 3.5 2.5 20h19L12 3.5Z" />
      <path d="M12 10v4.5" />
      <path d="M12 17.4v.1" />
    </svg>
  );
}

/** Chevron used by the diagnostics disclosures (rotates when expanded). */
export function ChevronIcon({ size = 16 }: IconProps): JSX.Element {
  return (
    <svg {...svgProps(size)}>
      <path d="M6 9.5l6 6 6-6" />
    </svg>
  );
}
