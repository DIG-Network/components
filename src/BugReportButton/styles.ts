/**
 * All styling for <BugReportButton> is inline (React `style` objects) — no CSS classes, no
 * stylesheet, no global selectors. This is deliberate: the component must never depend on the
 * host app's CSS and must never leak style into the host page (CLAUDE.md product-surface rule +
 * this component's own contract).
 */
import type { CSSProperties } from "react";
import type { BugReportButtonProps } from "./types";

/** Default accent — DIG purple, matching the bugreport.dig.net embeddable widget's default. */
export const DEFAULT_ACCENT_COLOR = "#7a3dff";

const FONT_FAMILY = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
// Above nearly everything a host app could have, but still one namespace below devtools-style
// browser UI overlays.
const Z_LAUNCHER = 2147483000;
const Z_OVERLAY = 2147483001;

type Position = NonNullable<BugReportButtonProps["position"]>;

function cornerOffsets(position: Position, offset: number): CSSProperties {
  return {
    position: "fixed",
    bottom: offset,
    ...(position === "bottom-left" ? { left: offset } : { right: offset }),
  };
}

export function launcherStyle(position: Position, accent: string): CSSProperties {
  return {
    ...cornerOffsets(position, 20),
    zIndex: Z_LAUNCHER,
    width: 56,
    height: 56,
    borderRadius: "50%",
    border: "none",
    background: accent,
    color: "#ffffff",
    fontSize: 26,
    lineHeight: 1,
    cursor: "pointer",
    boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: FONT_FAMILY,
    padding: 0,
  };
}

export const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: Z_OVERLAY,
  background: "rgba(15, 12, 24, 0.45)",
  display: "flex",
  alignItems: "flex-end",
  boxSizing: "border-box",
  padding: 20,
  fontFamily: FONT_FAMILY,
};

export function panelStyle(position: Position, accent: string): CSSProperties {
  return {
    width: "min(380px, 100%)",
    maxHeight: "min(640px, 90vh)",
    overflowY: "auto",
    background: "#ffffff",
    color: "#1a1420",
    borderRadius: 14,
    padding: 20,
    boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
    border: `1px solid ${accent}55`,
    display: "flex",
    flexDirection: "column",
    gap: 12,
    boxSizing: "border-box",
    fontSize: 14,
    lineHeight: 1.4,
    marginLeft: position === "bottom-left" ? 0 : "auto",
  };
}

export const headingStyle: CSSProperties = {
  margin: 0,
  fontSize: 17,
  fontWeight: 600,
  paddingRight: 28,
};

export function closeButtonStyle(accent: string): CSSProperties {
  return {
    position: "absolute",
    top: 12,
    right: 12,
    width: 28,
    height: 28,
    border: "none",
    borderRadius: 8,
    background: "transparent",
    color: accent,
    fontSize: 18,
    cursor: "pointer",
    lineHeight: 1,
  };
}

export const fieldGroupStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

export const labelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "#4a3f57",
};

export const inputStyle: CSSProperties = {
  fontFamily: FONT_FAMILY,
  fontSize: 14,
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #d7d0e0",
  boxSizing: "border-box",
  width: "100%",
};

export const textareaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: 80,
  resize: "vertical",
};

/** Visually AND assistive-technology hidden — the honeypot field must be invisible to both. */
export const honeypotStyle: CSSProperties = {
  position: "absolute",
  left: -9999,
  top: -9999,
  width: 1,
  height: 1,
  opacity: 0,
  overflow: "hidden",
  pointerEvents: "none",
};

export function primaryButtonStyle(accent: string, disabled: boolean): CSSProperties {
  return {
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: 600,
    padding: "10px 16px",
    borderRadius: 8,
    border: "none",
    background: disabled ? "#c9c2d6" : accent,
    color: "#ffffff",
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

export const secondaryButtonStyle: CSSProperties = {
  fontFamily: FONT_FAMILY,
  fontSize: 13,
  fontWeight: 500,
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid #d7d0e0",
  background: "#ffffff",
  color: "#3a2f47",
  cursor: "pointer",
};

export const screenshotPreviewStyle: CSSProperties = {
  maxWidth: "100%",
  maxHeight: 160,
  borderRadius: 8,
  border: "1px solid #d7d0e0",
  display: "block",
};

export const errorBannerStyle: CSSProperties = {
  background: "#fdecea",
  color: "#8a1c1c",
  border: "1px solid #f3b4b0",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 13,
};

export const successStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

export const consoleListStyle: CSSProperties = {
  maxHeight: 140,
  overflowY: "auto",
  margin: "6px 0",
  padding: "6px 8px",
  background: "#f5f2fa",
  borderRadius: 8,
  fontSize: 11,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  listStyle: "none",
};

/** Visually hides text while keeping it in the accessibility tree (for the aria-live status text). */
export const visuallyHiddenStyle: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0,0,0,0)",
  whiteSpace: "nowrap",
  border: 0,
};
