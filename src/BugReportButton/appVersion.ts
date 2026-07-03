/**
 * Host-app version detection for <BugReportButton>.
 *
 * Every report carries `app_version` so a maintainer can tell which build a bug came from. To
 * avoid per-app prop plumbing, the widget auto-detects the version when the `appVersion` prop is
 * not passed: a host app only has to expose its version ONCE (a meta tag or a global) and every
 * report from that page picks it up.
 */

/** Well-known meta tag a host page can set: `<meta name="app-version" content="1.2.3">`. */
const META_SELECTOR = 'meta[name="app-version"]';

function nonEmpty(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * Resolve the host app's version, first match wins:
 *
 * 1. the explicit `appVersion` prop (always wins when provided),
 * 2. `<meta name="app-version" content="…">` in the document,
 * 3. `window.__APP_VERSION__` (a string global),
 * 4. `undefined` (the report's `app_version` field is omitted).
 */
export function resolveAppVersion(explicit?: string): string | undefined {
  const fromProp = nonEmpty(explicit);
  if (fromProp) return fromProp;

  if (typeof document !== "undefined") {
    const fromMeta = nonEmpty(document.querySelector(META_SELECTOR)?.getAttribute("content"));
    if (fromMeta) return fromMeta;
  }

  if (typeof window !== "undefined") {
    const fromGlobal = nonEmpty((window as { __APP_VERSION__?: unknown }).__APP_VERSION__);
    if (fromGlobal) return fromGlobal;
  }

  return undefined;
}
