# @dignetwork/components

Reusable React component library for DIG Network apps. Ships as ESM + CJS + `.d.ts`; `react` and
`react-dom` are **peer dependencies** (never bundled). CSP-safe: no `eval`, no dynamic code
generation anywhere in the bundle.

First component: **`<BugReportButton>`** — a floating bug-report button + form any DIG React app
drops in to let users file a bug report against a GitHub repo, with a screenshot + console-log
preview the user reviews before anything is sent. More components will be added to this library
over time.

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
  theme={{ accentColor: "#7a3dff" }}
/>
```

## `<BugReportButton>` props

| Prop | Type | Required | Default | Description |
|---|---|---|---|---|
| `repo` | `string` | **yes** | — | The target GitHub repo this report is filed against, e.g. `"hub.dig.net"` or `"xchtip.app"`. Must be on the bugreport service's repo allowlist. |
| `apiBase` | `string` | no | `"https://api.bugreport.dig.net"` | Base URL of the bug-report service. |
| `position` | `"bottom-right" \| "bottom-left"` | no | `"bottom-right"` | Corner the floating launcher docks to. |
| `appVersion` | `string` | no | — | Sent as `app_version` on the report. |
| `theme` | `{ accentColor?: string }` | no | DIG purple (`#7a3dff`) | Optional accent color override. |

## Behavior

- A floating 🐞 button is fixed to the chosen corner with a high z-index; it never blocks the host
  app's UI, is keyboard-focusable, and has an accessible name ("Report a bug").
- Clicking it opens a report panel (`role="dialog"`, `aria-modal="true"`) with:
  - an optional **title** and a required **description**,
  - a **screenshot** section — a best-effort auto-capture attempt (`getDisplayMedia`) with a
    removable preview, plus a manual file-attach fallback,
  - a collapsible **console-log preview** — the last ~300 `console.*`/`window.onerror`/
    `unhandledrejection` entries captured from mount, kept in memory only, removable before send,
  - an optional **contact** field.
- **Privacy is non-negotiable**: the panel always shows exactly what will be sent (the screenshot
  and console-log previews, each removable), and nothing is ever transmitted without the user
  explicitly pressing **Send report**. There is no background capture or silent exfiltration.
- Four states drive the UI: **idle** (editable form) → **sending** (disabled form,
  `aria-live` status) → **success** (report id + GitHub issue link when one was created) or
  **error** (an honest message with a retry).
- Fully accessible: focus is trapped in the panel while open, `Escape` closes it and returns focus
  to the launcher, every control is labelled, status changes are announced via a live region, and
  `prefers-reduced-motion` is respected (the component has no motion beyond instant show/hide).
- Styling is 100% inline (`style` props) — no CSS classes, no stylesheet, nothing that can leak
  into or be overridden by the host app's CSS.

## Abuse-protection contract

`<BugReportButton>` implements the client side of the bugreport.dig.net anti-abuse contract:

1. On panel open: `GET {apiBase}/v1/challenge` → `{ token, exp }`. The token and the open
   timestamp are held in memory for this panel session.
2. On send: `POST {apiBase}/v1/reports` with the report fields plus `challenge_token` (from step
   1), `hp` (a honeypot field — always empty for a human; bound to an off-screen, `aria-hidden`,
   non-tabbable input a bot's autofill may fill in), and `opened_at_ms` (the time the panel was
   opened, so implausibly-fast submits can be rejected server-side).
3. Responses are mapped to an honest state: `200`/`202` → success (shows the id and GitHub issue
   link, if any); `403` → the challenge is refetched automatically and the user can retry; `429` →
   a "please wait" message; anything else → a generic honest error with retry. The component never
   silently drops a report or fabricates a fake success.

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
npm run verify       # typecheck + build + coverage
```

## License

MIT
