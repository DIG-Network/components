/** Optional accent theming for the launcher + panel. */
export interface BugReportButtonTheme {
  /** 6-digit hex accent color. Defaults to DIG purple (#7a3dff), matching the bugreport.dig.net widget. */
  accentColor?: string;
}

/** Props for {@link BugReportButton}. */
export interface BugReportButtonProps {
  /** The target GitHub repo this report is filed against, e.g. "hub.dig.net" or "xchtip.app". */
  repo: string;
  /** Bug-report service base URL. Defaults to `https://api.bugreport.dig.net`. */
  apiBase?: string;
  /** Corner the floating launcher docks to. Defaults to "bottom-right". */
  position?: "bottom-right" | "bottom-left";
  /** The embedding app's version, sent as `app_version` on the report. */
  appVersion?: string;
  /** Optional accent theming. */
  theme?: BugReportButtonTheme;
}
