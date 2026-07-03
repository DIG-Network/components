/**
 * Styling for <BugReportButton>: one SCOPED stylesheet injected while at least one instance is
 * mounted, plus per-instance CSS custom properties for theming.
 *
 * Containment contract:
 * - Every rule is scoped under a `digbr-` class — no global selectors, no element selectors that
 *   could touch host markup, so nothing leaks into the host page.
 * - Nothing here depends on host CSS: the widget roots reset font/box-sizing and every component
 *   class sets its own typography, so the panel renders identically on any site.
 * - CSP-safe and self-contained: no external fonts, images, or CDNs — icons are inline SVG and
 *   colors are plain CSS. (Hosts with a `style-src` that forbids ALL inline styles would block
 *   `style` attributes too; the widget requires the same inline-style allowance every React
 *   inline-styled component needs.)
 * - Dark mode via `prefers-color-scheme`, motion gated behind `prefers-reduced-motion`, and a
 *   mobile bottom-sheet layout via a width media query — none of which inline styles can express,
 *   which is why this is a stylesheet rather than `style` props.
 */

/** Default accent — DIG purple, the ecosystem brand primary. */
export const DEFAULT_ACCENT_COLOR = "#7a3dff";

/** Default gradient endpoint — DIG magenta (the brand's purple→magenta sweep). */
export const DEFAULT_ACCENT_SECONDARY = "#c13de0";

/** id of the injected `<style>` element (shared by all mounted instances, ref-counted). */
export const STYLE_ELEMENT_ID = "digbr-styles";

/** Class prefix every rule lives under; also useful for consumers writing e2e selectors. */
export const CLASS_PREFIX = "digbr";

/**
 * Build the full scoped stylesheet. Pure string — safe to snapshot/test. Kept in one template so
 * the design system (spacing rhythm, radii, elevation, color tokens) reads as a single unit.
 */
export function buildStylesheet(): string {
  return `
/* == @dignetwork/components BugReportButton — scoped styles (digbr-*) ===================== */

.digbr-root {
  /* Brand accents — overridable per instance via inline custom properties. */
  --digbr-accent: ${DEFAULT_ACCENT_COLOR};
  --digbr-accent-2: ${DEFAULT_ACCENT_SECONDARY};
  /* Ink used where accent must meet AA contrast on tinted surfaces. */
  --digbr-accent-ink: #6b2bf0;
  /* Light-theme surface + ink tokens. */
  --digbr-surface: #ffffff;
  --digbr-surface-2: #f7f5fb;
  --digbr-surface-3: #eee9f6;
  --digbr-text: #1c1526;
  --digbr-text-2: #5f5570;
  --digbr-border: #e6e1ef;
  --digbr-border-2: #d5cde4;
  --digbr-ring: rgba(122, 61, 255, 0.28);
  /* Lighter than the focus ring: keeps the hot-count badge text at >=4.5:1 (WCAG AA). */
  --digbr-badge-hot: rgba(122, 61, 255, 0.12);
  --digbr-warn: #8a5800;
  --digbr-danger: #b3251c;
  --digbr-danger-bg: #fdeeec;
  --digbr-danger-border: #f2c1bc;
  --digbr-scrim: rgba(14, 9, 24, 0.5);
  --digbr-shadow:
    0 24px 64px -12px rgba(24, 8, 56, 0.4),
    0 6px 20px -6px rgba(24, 8, 56, 0.22);

  font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 14px;
  line-height: 1.45;
  -webkit-font-smoothing: antialiased;
  box-sizing: border-box;
}
.digbr-root *,
.digbr-root *::before,
.digbr-root *::after { box-sizing: inherit; }

@media (prefers-color-scheme: dark) {
  .digbr-root {
    --digbr-accent-ink: #b79bff;
    --digbr-surface: #171221;
    --digbr-surface-2: #201a2e;
    --digbr-surface-3: #2b2340;
    --digbr-text: #f0ecf7;
    --digbr-text-2: #a89fb8;
    --digbr-border: #322a44;
    --digbr-border-2: #463b5e;
    --digbr-ring: rgba(159, 116, 255, 0.38);
    --digbr-badge-hot: rgba(159, 116, 255, 0.2);
    --digbr-warn: #ffc266;
    --digbr-danger: #ff958c;
    --digbr-danger-bg: rgba(255, 99, 88, 0.12);
    --digbr-danger-border: rgba(255, 99, 88, 0.35);
    --digbr-scrim: rgba(8, 5, 15, 0.65);
    --digbr-shadow:
      0 24px 64px -12px rgba(0, 0, 0, 0.7),
      0 6px 20px -6px rgba(0, 0, 0, 0.5);
  }
}

/* -- Launcher (floating action button) ---------------------------------------------------- */

.digbr-launcher {
  position: fixed;
  bottom: 20px;
  z-index: 2147483000;
  width: 56px;
  height: 56px;
  padding: 0;
  border: none;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  cursor: pointer;
  background: linear-gradient(135deg, var(--digbr-accent) 8%, var(--digbr-accent-2) 92%);
  box-shadow:
    0 2px 6px rgba(20, 8, 46, 0.22),
    0 10px 26px -6px rgba(122, 61, 255, 0.55);
  transition: transform 160ms ease, box-shadow 160ms ease, filter 160ms ease;
}
.digbr-launcher.digbr-right { right: 20px; }
.digbr-launcher.digbr-left { left: 20px; }
.digbr-launcher:hover {
  transform: translateY(-2px) scale(1.04);
  filter: brightness(1.06);
  box-shadow:
    0 4px 10px rgba(20, 8, 46, 0.26),
    0 14px 32px -6px rgba(122, 61, 255, 0.6);
}
.digbr-launcher:active { transform: translateY(0) scale(0.96); filter: brightness(0.97); }
.digbr-launcher:focus-visible {
  outline: none;
  box-shadow:
    0 0 0 3px var(--digbr-surface),
    0 0 0 6px var(--digbr-ring),
    0 10px 26px -6px rgba(122, 61, 255, 0.55);
}

/* -- Overlay + panel ----------------------------------------------------------------------- */

.digbr-overlay {
  position: fixed;
  inset: 0;
  z-index: 2147483001;
  display: flex;
  align-items: flex-end;
  padding: 16px;
  background: var(--digbr-scrim);
  -webkit-backdrop-filter: blur(3px);
  backdrop-filter: blur(3px);
}
.digbr-overlay.digbr-right { justify-content: flex-end; }
.digbr-overlay.digbr-left { justify-content: flex-start; }

/* Hidden (both widget roots) while the user drives the opt-in screen-capture picker. */
.digbr-capturing { visibility: hidden; }

.digbr-panel {
  position: relative;
  width: min(400px, 100%);
  max-height: min(720px, calc(100vh - 24px));
  display: flex;
  flex-direction: column;
  color: var(--digbr-text);
  background: var(--digbr-surface);
  border: 1px solid var(--digbr-border);
  border-radius: 16px;
  box-shadow: var(--digbr-shadow);
  overflow: hidden;
  animation: digbr-panel-in 220ms cubic-bezier(0.21, 1.02, 0.55, 1);
}
.digbr-panel::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--digbr-accent), var(--digbr-accent-2));
}
@keyframes digbr-panel-in {
  from { opacity: 0; transform: translateY(14px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.digbr-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 20px 20px 14px;
  border-bottom: 1px solid var(--digbr-border);
}
.digbr-header-icon {
  flex: none;
  width: 36px;
  height: 36px;
  border-radius: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  background: linear-gradient(135deg, var(--digbr-accent), var(--digbr-accent-2));
  box-shadow: 0 4px 12px -2px rgba(122, 61, 255, 0.45);
}
.digbr-header-text { flex: 1; min-width: 0; }
.digbr-title {
  margin: 0;
  font-size: 16px;
  font-weight: 650;
  letter-spacing: -0.01em;
  line-height: 1.25;
}
.digbr-subtitle { margin: 3px 0 0; font-size: 12.5px; color: var(--digbr-text-2); }
.digbr-close {
  flex: none;
  width: 36px;
  height: 36px;
  margin: -6px -8px 0 0;
  padding: 0;
  border: none;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--digbr-text-2);
  background: transparent;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}
.digbr-close:hover { background: var(--digbr-surface-2); color: var(--digbr-text); }
.digbr-close:focus-visible { outline: 2px solid var(--digbr-accent); outline-offset: 1px; }

.digbr-body {
  overflow-y: auto;
  padding: 16px 20px 20px;
}
.digbr-form,
.digbr-stack { display: flex; flex-direction: column; gap: 14px; }

/* -- Fields --------------------------------------------------------------------------------- */

.digbr-field { display: flex; flex-direction: column; gap: 6px; }
.digbr-label {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--digbr-text-2);
}
.digbr-optional { font-weight: 500; opacity: 0.85; }
.digbr-req { color: var(--digbr-accent-ink); }

.digbr-input,
.digbr-textarea {
  font: inherit;
  font-size: 14px;
  width: 100%;
  padding: 10px 12px;
  color: var(--digbr-text);
  background: var(--digbr-surface-2);
  border: 1px solid var(--digbr-border);
  border-radius: 10px;
  transition: border-color 120ms ease, box-shadow 120ms ease, background 120ms ease;
}
.digbr-input::placeholder,
.digbr-textarea::placeholder { color: var(--digbr-text-2); opacity: 0.72; }
.digbr-input:focus,
.digbr-textarea:focus {
  outline: none;
  border-color: var(--digbr-accent);
  background: var(--digbr-surface);
  box-shadow: 0 0 0 3px var(--digbr-ring);
}
.digbr-input:disabled,
.digbr-textarea:disabled { opacity: 0.6; cursor: not-allowed; }
.digbr-textarea { min-height: 88px; resize: vertical; }

/* -- Buttons -------------------------------------------------------------------------------- */

.digbr-btn-primary {
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  width: 100%;
  min-height: 44px; /* WCAG 2.5.8 with headroom: primary action gets the ~44px comfort size */
  padding: 10px 16px;
  border: none;
  border-radius: 12px;
  color: #ffffff;
  cursor: pointer;
  background: linear-gradient(135deg, var(--digbr-accent), var(--digbr-accent-2));
  box-shadow: 0 6px 18px -6px rgba(122, 61, 255, 0.55);
  transition: transform 140ms ease, filter 140ms ease, box-shadow 140ms ease;
}
.digbr-btn-primary:hover:not(:disabled) { filter: brightness(1.07); transform: translateY(-1px); }
.digbr-btn-primary:active:not(:disabled) { transform: translateY(0); filter: brightness(0.98); }
.digbr-btn-primary:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--digbr-surface), 0 0 0 6px var(--digbr-ring);
}
.digbr-btn-primary:disabled {
  background: var(--digbr-surface-3);
  color: var(--digbr-text-2);
  box-shadow: none;
  cursor: not-allowed;
}

.digbr-btn-secondary {
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 36px; /* comfortably above the 24px WCAG 2.5.8 floor */
  padding: 7px 12px;
  border: 1px solid var(--digbr-border-2);
  border-radius: 10px;
  color: var(--digbr-text);
  background: var(--digbr-surface);
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease;
}
.digbr-btn-secondary:hover { background: var(--digbr-surface-2); border-color: var(--digbr-accent); }
.digbr-btn-secondary:focus-visible { outline: 2px solid var(--digbr-accent); outline-offset: 1px; }

.digbr-btn-ghost {
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 28px; /* >= 24px WCAG 2.5.8 floor */
  padding: 4px 10px;
  border: none;
  border-radius: 8px;
  color: var(--digbr-text-2);
  background: transparent;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}
.digbr-btn-ghost:hover:not(:disabled) { background: var(--digbr-surface-3); color: var(--digbr-text); }
.digbr-btn-ghost:focus-visible { outline: 2px solid var(--digbr-accent); outline-offset: 1px; }
.digbr-btn-ghost:disabled,
.digbr-btn-secondary:disabled { opacity: 0.55; cursor: not-allowed; }

/* -- Screenshot ------------------------------------------------------------------------------ */

.digbr-shot {
  position: relative;
  border: 1px solid var(--digbr-border);
  border-radius: 12px;
  overflow: hidden;
  background: var(--digbr-surface-2);
}
.digbr-shot-img { display: block; width: 100%; max-height: 170px; object-fit: contain; }
.digbr-shot-remove {
  position: absolute;
  top: 8px;
  right: 8px;
  min-height: 26px; /* >= 24px WCAG 2.5.8 floor */
  padding: 4px 12px;
  border: none;
  border-radius: 999px;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  color: #ffffff;
  background: rgba(18, 10, 34, 0.66);
  -webkit-backdrop-filter: blur(4px);
  backdrop-filter: blur(4px);
  cursor: pointer;
  transition: background 120ms ease;
}
.digbr-shot-remove:hover { background: rgba(18, 10, 34, 0.85); }
.digbr-shot-remove:focus-visible { outline: 2px solid #ffffff; outline-offset: 1px; }
.digbr-shot-caption { margin: 0; font-size: 11.5px; line-height: 1.5; color: var(--digbr-text-2); }

.digbr-attach-row { display: flex; gap: 8px; flex-wrap: wrap; }

/* File attach: the real (focusable) input invisibly COVERS its styled twin, so the visible
   button IS the input's hit target — native semantics, full-size WCAG 2.5.8 target. */
.digbr-filebtn { position: relative; display: inline-flex; }
.digbr-filebtn .digbr-file-input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  opacity: 0;
  cursor: pointer;
}
.digbr-filebtn .digbr-file-input:disabled { cursor: not-allowed; }
.digbr-filebtn:focus-within .digbr-btn-secondary {
  border-color: var(--digbr-accent);
  box-shadow: 0 0 0 3px var(--digbr-ring);
}
.digbr-filebtn:hover .digbr-btn-secondary {
  background: var(--digbr-surface-2);
  border-color: var(--digbr-accent);
}

/* -- Diagnostics disclosures ------------------------------------------------------------------ */

.digbr-diagnostics { display: flex; flex-direction: column; gap: 8px; }
.digbr-hint { margin: 0; font-size: 12px; line-height: 1.5; color: var(--digbr-text-2); }

.digbr-disclosure {
  border: 1px solid var(--digbr-border);
  border-radius: 12px;
  overflow: hidden;
  background: var(--digbr-surface);
}
.digbr-disclosure-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 40px; /* well above the 24px WCAG 2.5.8 floor (was the flagged <summary>) */
  padding: 9px 12px;
  border: none;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  text-align: left;
  color: var(--digbr-text);
  background: transparent;
  cursor: pointer;
  transition: background 120ms ease;
}
.digbr-disclosure-toggle:hover { background: var(--digbr-surface-2); }
.digbr-disclosure-toggle:focus-visible { outline: 2px solid var(--digbr-accent); outline-offset: -2px; }

.digbr-count {
  min-width: 22px;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 650;
  text-align: center;
  color: var(--digbr-text-2);
  background: var(--digbr-surface-3);
}
.digbr-count-hot { color: var(--digbr-accent-ink); background: var(--digbr-badge-hot); }

.digbr-chevron { margin-left: auto; flex: none; color: var(--digbr-text-2); transition: transform 160ms ease; }
.digbr-chevron-open { transform: rotate(180deg); }

.digbr-disclosure-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid var(--digbr-border);
  background: var(--digbr-surface-2);
}
/* display:flex above would defeat the UA's [hidden] rule — re-assert it. */
.digbr-disclosure-body[hidden] { display: none; }
.digbr-log {
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 150px;
  overflow: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  line-height: 1.6;
  color: var(--digbr-text-2);
  overflow-wrap: anywhere;
}
.digbr-log-level { font-weight: 650; margin-right: 6px; }
.digbr-log-error .digbr-log-level { color: var(--digbr-danger); }
.digbr-log-warn .digbr-log-level { color: var(--digbr-warn); }
.digbr-log-network .digbr-log-level { color: var(--digbr-accent-ink); }
.digbr-log-empty { margin: 0; font-size: 12px; font-style: italic; color: var(--digbr-text-2); }
.digbr-disclosure-actions { display: flex; justify-content: flex-end; }

/* -- Status banners + success ------------------------------------------------------------------ */

.digbr-error {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--digbr-danger-border);
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.45;
  color: var(--digbr-danger);
  background: var(--digbr-danger-bg);
}
.digbr-error svg { flex: none; margin-top: 1px; }

.digbr-success {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 10px;
  padding: 14px 4px 4px;
}
.digbr-success-check {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  background: linear-gradient(135deg, var(--digbr-accent), var(--digbr-accent-2));
  box-shadow: 0 10px 28px -8px rgba(122, 61, 255, 0.6);
  animation: digbr-pop 260ms cubic-bezier(0.2, 1.4, 0.5, 1);
}
@keyframes digbr-pop {
  from { transform: scale(0.5); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
.digbr-success-title { margin: 2px 0 0; font-size: 15px; font-weight: 650; }
.digbr-success-note { margin: 0; font-size: 12.5px; line-height: 1.5; color: var(--digbr-text-2); }
.digbr-ref {
  display: inline-flex;
  align-items: center;
  padding: 5px 10px;
  border: 1px solid var(--digbr-border);
  border-radius: 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  color: var(--digbr-text-2);
  background: var(--digbr-surface-2);
}
.digbr-success .digbr-btn-primary { margin-top: 6px; }

.digbr-footnote { margin: 0; text-align: center; font-size: 11.5px; color: var(--digbr-text-2); }

/* -- Hidden helpers ----------------------------------------------------------------------------- */

/* Visually hidden, still in the accessibility tree (aria-live status region). */
.digbr-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

/* Honeypot: invisible to sighted users; ALSO aria-hidden + tabIndex=-1 in the markup. */
.digbr-honeypot {
  position: absolute;
  left: -9999px;
  top: -9999px;
  width: 1px;
  height: 1px;
  opacity: 0;
  overflow: hidden;
  pointer-events: none;
}

/* -- Responsive + motion preferences ------------------------------------------------------------ */

@media (max-width: 520px) {
  .digbr-overlay { padding: 0; }
  .digbr-panel {
    width: 100%;
    max-height: 92vh;
    border-radius: 16px 16px 0 0;
    border-left: none;
    border-right: none;
    border-bottom: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .digbr-root,
  .digbr-root *,
  .digbr-root *::before,
  .digbr-root *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
`;
}

let refCount = 0;
let styleElement: HTMLStyleElement | null = null;

/**
 * Inject the scoped stylesheet (once, shared + ref-counted across instances). Returns a release
 * function; the stylesheet is removed when the last mounted instance releases.
 */
export function acquireStylesheet(doc: Document = document): () => void {
  refCount += 1;
  if (!styleElement || !styleElement.isConnected) {
    styleElement = doc.createElement("style");
    styleElement.id = STYLE_ELEMENT_ID;
    styleElement.textContent = buildStylesheet();
    doc.head.appendChild(styleElement);
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    refCount -= 1;
    if (refCount <= 0) {
      refCount = 0;
      styleElement?.remove();
      styleElement = null;
    }
  };
}
