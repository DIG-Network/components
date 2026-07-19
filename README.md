# @dignetwork/components

Reusable React component library for DIG Network apps. Ships as ESM + CJS + `.d.ts`; `react` and
`react-dom` are **peer dependencies** (never bundled). CSP-safe: no `eval`, no dynamic code
generation, no external fonts/CDNs anywhere in the bundle.

First component: **`<BugReportButton>`** — a floating bug-report button + panel any DIG React app
drops in to let users file a bug report against a GitHub repo, with an automatic clean-page
screenshot, console + network error capture, and a full preview the user reviews before anything
is sent. More components will be added to this library over time.

## Install

```bash
npm install @dignetwork/components react react-dom
```

## Usage

```tsx
import { BugReportButton } from "@dignetwork/components";

function App() {
  return (
    <>
      {/* ...your app... */}
      <BugReportButton repo="hub.dig.net" />
    </>
  );
}
```

With all options:

```tsx
<BugReportButton
  repo="xchtip.app"
  apiBase="https://api.bugreport.dig.net"
  position="bottom-right"
  appVersion="1.4.2"
  theme={{ accentColor: "#7a3dff", accentColorSecondary: "#c13de0" }}
/>
```

## `<BugReportButton>` props

| Prop         | Type                                      | Required | Default                           | Description                                                                                                                                      |
| ------------ | ----------------------------------------- | -------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `repo`       | `string`                                  | **yes**  | —                                 | App identifier; filed to DIG-Network/dig_ecosystem with area: label. E.g. `"hub.dig.net"` or `"xchtip.app"`. Must be on the service's allowlist. |
| `apiBase`    | `string`                                  | no       | `"https://api.bugreport.dig.net"` | Base URL of the bug-report service.                                                                                                              |
| `position`   | `"bottom-right" \| "bottom-left"`         | no       | `"bottom-right"`                  | Corner the floating launcher docks to.                                                                                                           |
| `appVersion` | `string`                                  | no       | auto-detected                     | Sent as `app_version` on the report. When omitted, auto-detected (see below).                                                                    |
| `theme`      | `{ accentColor?, accentColorSecondary? }` | no       | DIG purple→magenta                | Accent gradient override. A single `accentColor` renders solid.                                                                                  |

### App-version auto-detection

Every report carries `app_version` so maintainers can tell which build a bug came from. Instead of
plumbing a prop through every render, a host app can expose its version ONCE and the widget picks
it up automatically. Resolution order (first match wins — also exported as `resolveAppVersion`):

1. the `appVersion` prop,
2. `<meta name="app-version" content="1.4.2">` in the document head,
3. `window.__APP_VERSION__` (a string global),
4. omitted.

## Behavior

- A polished floating action button (gradient, inline SVG bug icon, accessible name "Report a
  bug") is fixed to the chosen corner with a high z-index; it never blocks the host app's UI.
- Clicking it opens an elevated report panel (`role="dialog"`, `aria-modal="true"`) with:
  - an optional **title**, a required **description**, and an optional **contact** field,
  - a **screenshot** section — see "Screenshot capture" below,
  - a **Diagnostics** area with two collapsible disclosures — **Console errors** (the last ~300
    `console.*` / `window.onerror` / `unhandledrejection` entries captured from mount) and
    **Network errors** (failed `fetch`/XHR requests captured from mount) — each previewable and
    removable before send, plus a hint telling the user the capture is automatic.
- **Privacy is non-negotiable**: the panel always shows exactly what will be sent (screenshot,
  console and network previews, each removable), and nothing is ever transmitted without the user
  explicitly pressing **Send report**. All capture is memory-only; network capture records
  method + URL (query string stripped) + status + timing — never request/response bodies or
  headers.
- Four states drive the UI: **idle** (editable form) → **sending** (disabled form, `aria-live`
  status) → **success** (a confirmation with the opaque report reference — no GitHub issue link;
  issue URLs are maintainer-internal) or **error** (an honest inline message with a retry that
  keeps the draft).
- Fully accessible (WCAG 2.2 AA, verified with `@axe-core/playwright` including the
  `target-size` rule): focus is trapped in the panel, `Escape` closes and restores focus, every
  control is labelled, all interactive targets are ≥24×24 px (launcher and primary action ≥44 px),
  status changes are announced via a live region, and `prefers-reduced-motion` disables motion.
- **Styling is scoped and self-contained**: one `digbr-`-prefixed stylesheet injected while
  mounted (removed on unmount), themed per instance via CSS custom properties. No global
  selectors, no dependency on host CSS, automatic dark mode via `prefers-color-scheme`, and a
  bottom-sheet layout on small screens.

## Screenshot capture

1. **Automatic (default): clean-page DOM rasterization.** When the panel opens, the widget
   snapshots the page DOM synchronously — BEFORE the panel mounts, and always excluding the
   widget's own launcher/panel (marked `data-dig-bugreport`) — then rasterizes it to a PNG via a
   self-contained SVG `foreignObject` pipeline (no library, no network, CSP-safe). The preview
   shows the page exactly as the user saw it, with no report UI in the shot, and no permission
   prompt. `getDisplayMedia` is **never** called automatically.
2. **Explicit opt-in: "Capture screen".** For content DOM rasterization can't render
   (cross-origin iframes, WebGL), the user can press "Capture screen", which opens the browser's
   share picker; the widget hides its own chrome for the duration so the frame can't include the
   panel.
3. **Manual: "Attach image".** A styled file-attach control (PNG/JPEG) as the universal fallback.

Whatever the source, the screenshot is previewed with a **Remove** affordance and is only sent if
still attached when the user presses Send report.

## Abuse-protection contract

`<BugReportButton>` implements the client side of the bugreport.dig.net anti-abuse contract:

1. On panel open: `GET {apiBase}/v1/challenge` → `{ token, exp }`. The token and the open
   timestamp are held in memory for this panel session.
2. On send: `POST {apiBase}/v1/reports` with the report fields plus `challenge_token` (from step
   1), `hp` (a honeypot field — always empty for a human; bound to an off-screen, `aria-hidden`,
   non-tabbable input a bot's autofill may fill in), and `opened_at_ms` (the time the panel was
   opened, so implausibly-fast submits can be rejected server-side). Captured network errors are
   merged into `console_logs` with level `"network"`, so the backend needs no schema change.
3. Responses are mapped to an honest state: `200`/`202` → success (shows the report reference);
   `403` → the challenge is refetched automatically and the user can retry; `429` → a "please
   wait" message; anything else → a generic honest error with retry. The component never silently
   drops a report or fabricates a fake success.

See `SPEC.md` for the full normative wire contract.

## Adding more components

This package is structured as a small library, not a single component:

```
src/
  index.ts             # public barrel — re-export every component here
  BugReportButton/
    index.ts            # component's own barrel
    BugReportButton.tsx
    types.ts
    ...
```

New components get their own `src/<ComponentName>/` directory (component + types + tests
co-located) and are re-exported from `src/index.ts`.

## Development

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest run
npm run coverage    # vitest run --coverage (CI-gated at >=80%)
npm run build       # tsup -> dist/ (ESM + CJS + .d.ts)
npm run verify      # typecheck + build + coverage
npm run e2e         # Playwright: axe a11y (WCAG 2.2 incl. target-size) + capture pipeline +
                    # design screenshots (desktop/mobile, light/dark) against e2e/harness
```

## License

MIT
