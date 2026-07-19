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

/** Props for {@link BugReportButton}. */
export interface BugReportButtonProps {
  /** App identifier; filed to DIG-Network/dig_ecosystem with area: label. Must be on the allowlist. E.g. "hub.dig.net" or "xchtip.app". */
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
}
