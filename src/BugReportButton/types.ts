/** Optional accent theming for the launcher + panel. */
export interface BugReportButtonTheme {
  /**
   * 6-digit hex accent color (the gradient start). Defaults to DIG purple (#7a3dff). When set
   * without `accentColorSecondary`, the widget renders a solid accent instead of the brand
   * gradient.
   */
  accentColor?: string;
  /**
   * 6-digit hex gradient endpoint. Defaults to DIG magenta (#c13de0) when `accentColor` is
   * unset, otherwise to `accentColor` (solid).
   */
  accentColorSecondary?: string;
}

import type { BugReportMessages } from "./messages";

/** Props for {@link BugReportButton}. */
export interface BugReportButtonProps {
  /** Target repo: the report is filed as a GitHub issue in the named `repo` (validated against the bug-report service's allowlist). E.g. "hub.dig.net" or "xchtip.app". */
  repo: string;
  /** Bug-report service base URL. Defaults to `https://api.bugreport.dig.net`. */
  apiBase?: string;
  /** Corner the floating launcher docks to. Defaults to "bottom-right". */
  position?: "bottom-right" | "bottom-left";
  /**
   * The embedding app's version, sent as `app_version` on the report. When omitted, the widget
   * auto-detects it from `<meta name="app-version">` or `window.__APP_VERSION__` (see
   * `resolveAppVersion`), so a host app can expose its version once instead of plumbing a prop.
   */
  appVersion?: string;
  /** Optional accent theming. */
  theme?: BugReportButtonTheme;
  /**
   * Optional localized copy. Every user-visible string the widget renders has an English default
   * (see {@link BugReportMessages}/`DEFAULT_MESSAGES`); pass a partial override — sourced from the
   * host app's own i18n catalog — to translate any subset. Omitted (or partial) keys fall back to
   * English, so this is purely additive and backwards-compatible. Brand/scheme tokens ($DIG,
   * chia://, DIGHub, dig://, XCH) MUST be preserved verbatim in any translated string.
   */
  messages?: Partial<BugReportMessages>;
}
