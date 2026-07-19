# @dignetwork/components — normative specification

This document is the authoritative contract for the `@dignetwork/components` package. An
independent reimplementation of any exported component MUST interoperate with the deployed
bugreport.dig.net service (or a compatible `apiBase`) exactly as described here.

---

## 1. Package

- **Name:** `@dignetwork/components`. **Distribution:** ESM (`dist/index.js`) + CJS
  (`dist/index.cjs`) + TypeScript declarations (`dist/index.d.ts`), built with `tsup`.
- **Peer dependencies:** `react` and `react-dom`, both `>=18.0.0`. Neither is bundled — a
  bundled/duplicated React instance is a bug (breaks hooks via the "invalid hook call" class of
  failure when two React copies exist in one page).
- **CSP:** the bundle contains no `eval`, no `new Function(...)`, and no other dynamic
  code-generation. It runs under a strict `script-src 'self'` CSP with no `unsafe-eval`. No
  external resource (font, image, stylesheet, CDN script) is ever referenced.
- **Side effects:** `sideEffects: false`. Importing any export must not mutate global state by
  itself; global state (console/network wrapping, event listeners, the scoped stylesheet) is only
  installed while a component that needs it is mounted, and torn down on unmount.
- **Structure:** each component lives in its own `src/<ComponentName>/` directory (component +
  types + supporting modules + tests, co-located) and is re-exported from the package root
  `src/index.ts`. New components are added the same way; this file gains a new numbered section
  per component.
- **Exports:** `BugReportButton` (component), `resolveAppVersion` (helper, §2.8), and the public
  types (`BugReportButtonProps`, `BugReportButtonTheme`, `ConsoleLogEntry`, `ConsoleLogLevel`,
  `NetworkLogEntry`, `ChallengeResponse`, `ReportPayload`, `SubmitReportResult`, `IssueRef`).

---

## 2. `<BugReportButton>`

### 2.1 Props

| Prop         | Type                                                      | Required | Default                                                       |
| ------------ | --------------------------------------------------------- | -------- | ------------------------------------------------------------- |
| `repo`       | `string`                                                  | yes      | —                                                             |
| `apiBase`    | `string`                                                  | no       | `"https://api.bugreport.dig.net"`                             |
| `position`   | `"bottom-right" \| "bottom-left"`                         | no       | `"bottom-right"`                                              |
| `appVersion` | `string`                                                  | no       | auto-detected (§2.8)                                          |
| `theme`      | `{ accentColor?: string; accentColorSecondary?: string }` | no       | `{ accentColor: "#7a3dff", accentColorSecondary: "#c13de0" }` |

`repo` is passed through verbatim to the server, which validates it against its own allowlist
(§3.4 of bugreport.dig.net's `SPEC.md`). This package does not itself validate `repo` — the server
is the single source of truth for the allowlist so it can change without a client release.

Theming: the accent pair drives a purple→magenta gradient (launcher, header icon, primary button,
success badge). When only `accentColor` is provided, `accentColorSecondary` defaults to the same
value (a solid accent, never a mismatched gradient).

### 2.2 Lifecycle & state machine

The component has one boolean, `panelOpen`, and one status enum driving the panel body:

```
idle → sending → success
  ↑        ↓
  └──── error
```

- **idle** — the form is editable. `Send report` is disabled while `description` is empty or
  whitespace-only.
- **sending** — set synchronously on submit; the form is disabled (all inputs + the submit
  button); the `aria-live="polite"` status region announces "Sending report…".
- **success** — set when the server accepts the report (`200`/`202`). Shows a confirmation and the
  opaque report `id` as a reference the user can quote. The GitHub issue reference the API may
  return is **NOT surfaced** — issue URLs are maintainer-internal navigation, not end-user UI; a
  client MUST NOT render a link to it. The form is unmounted in favor of the success view; closing
  the panel (Escape, the × button, or "Done") is the only action available.
- **error** — set on any non-accepted outcome. The form REMAINS mounted with the user's draft
  intact (title/description/contact/screenshot/diagnostics selection are never cleared on error)
  so a retry costs nothing. The submit button doubles as the retry action; its label changes to
  "Retry".

Opening the panel (the launcher click while closed) performs, IN THIS ORDER:

1. **Synchronously snapshots the page DOM for the automatic screenshot (§2.3) BEFORE the panel
   mounts** — the ordering is a contract: the shot must show the page exactly as the user saw it,
   with no report UI in it.
2. Resets the draft to a blank state (title/description/contact/screenshot cleared, disclosures
   collapsed).
3. Records `openedAt = Date.now()` (sent as `opened_at_ms`).
4. Calls `GET {apiBase}/v1/challenge` (§2.4) and stores the resulting token.
5. Mounts the panel; when the (asynchronous) rasterization completes, the screenshot preview is
   filled in — unless the user already attached an image, or the panel session that started the
   capture has been closed (a stale capture is discarded).

Closing the panel does not send anything and does not need network access.

### 2.3 Screenshot capture

Three tiers, strictly ordered. Every tier is best-effort (failure falls through, never throws)
and produces a PNG/JPEG data URL that is previewed in the panel with a **Remove** affordance.

1. **Automatic (default): in-page DOM rasterization** (`captureViewportScreenshot`). No permission
   prompt, no picker, and `getDisplayMedia` is **NEVER invoked automatically** — a client that
   auto-triggers the screen-share picker is non-conforming. Mechanics (self-contained, no external
   library or network dependency):
   - The page DOM is deep-cloned **synchronously at open time, before the panel mounts**. Every
     element carrying the `data-dig-bugreport` marker attribute (the widget stamps it on its
     launcher and overlay roots) is excluded, subtree and all. `script`/`style`/`link`/`iframe`/
     media elements are dropped; each remaining element's computed style is inlined; live form
     state is reflected (never password or file input values); `<canvas>` content is snapshotted
     where readable.
   - Asynchronously (on the detached clone only): `<img>` sources are inlined as data URLs
     (same-origin/CORS fetch with a short timeout; unfetchable images are stripped), `srcset` and
     external `url(...)` style references are removed (an SVG rendered as an image may not load
     any external resource).
   - The clone is serialized into `<svg><foreignObject>` markup, loaded as a data-URL image, drawn
     to a canvas at CSS-pixel scale (1×, keeping the payload well under the server's decoded-size
     cap) over a backfill of the page's background color, and exported via
     `canvas.toDataURL("image/png")`.
2. **Explicit opt-in: screen capture** (`captureScreenViaDisplayMedia`), bound to the panel's
   "Capture screen" button ONLY — for content DOM rasterization can't render (cross-origin
   iframes, WebGL). Before invoking `navigator.mediaDevices.getDisplayMedia`, the component hides
   its own chrome (launcher + overlay get `visibility: hidden`) for the duration, so the captured
   frame cannot include the report panel covering the page. One frame is drawn to a canvas and
   exported as PNG; all media tracks are stopped immediately after.
3. **Manual: file attach** — `<input type="file" accept="image/png,image/jpeg">` rendered as a
   styled control (§2.7); the file is read via `FileReader.readAsDataURL` and replaces any
   current screenshot.

Nothing captured by this section is ever sent automatically — it is included in the next
`POST /v1/reports` call ONLY if still present in state when the user presses Send report. There is
no client-side size-capping or re-encoding beyond the 1× rasterization scale; the server enforces
the size cap (2 MiB decoded) and rejects oversized/invalid images.

### 2.4 Abuse-protection contract (client side)

This is the exact wire contract; the bugreport.dig.net service implements the server side to
match. A client MUST NOT deviate from field names, types, or the request sequence below.

**On panel open** — `GET {apiBase}/v1/challenge`:

- Response `200`: `{ "token": "<opaque string>", "exp": <number, epoch ms> }`.
- The `token` is held in memory for the lifetime of the open panel; it is not persisted (not
  localStorage, not cookies).
- On any failure (network error or non-2xx), the token is left unset; the component will retry
  the fetch transparently the next time the user presses Send report (see below) before giving up
  with an honest error.

**On submit** — `POST {apiBase}/v1/reports`, JSON body:

```ts
{
  repo: string,
  title?: string,
  description: string,               // required, non-empty after trim
  reporter_contact?: string,
  url?: string,                      // window.location.href at submit time
  user_agent?: string,               // navigator.userAgent
  app_version?: string,              // resolveAppVersion(appVersion) — §2.8
  console_logs?: ConsoleLogEntry[],  // console entries + network entries (§2.5/§2.6), merged
                                     // chronologically by ts_ms; present only when non-empty
  screenshot?: string,               // data URL, present only when one is attached
  challenge_token: string,           // from the most recent /v1/challenge call
  hp: string,                        // honeypot — ALWAYS "" for a human; see below
  opened_at_ms: number,              // Date.now() when the panel opened
}
```

- **`challenge_token`** — if no token is held (initial fetch failed), the component fetches one
  fresh, synchronously blocking the submit, before sending. If that also fails, the submission is
  aborted with an honest error and NO request is sent to `/v1/reports`.
- **`hp`** — bound to a real `<input name="email_confirm">` rendered off-screen
  (`position: absolute; left: -9999px`), `tabIndex={-1}`, and `aria-hidden="true"` — invisible and
  unreachable for a sighted, keyboard, or assistive-technology user, but present in the DOM for a
  bot that blindly fills every input on the page. The client NEVER inspects or blocks on this
  field's value — it is forwarded verbatim; the server is the sole enforcement point (a non-empty
  `hp` marks the submission as a bot server-side).
- **`opened_at_ms`** — the server uses this to reject implausibly-fast submissions (a real human
  cannot fill and submit the form in a few hundred milliseconds). The client does not enforce a
  minimum delay itself; it simply reports the true value.

**Response handling** (discriminated purely on HTTP status + body, never inferred from timing):

| Status                                  | Client outcome                                                                                                                                                                                                                                     |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `200` or `202`                          | **accepted** — `{ id, issue }` from the body drive the success view. `issue` is `null` when no GitHub issue was created (still a successful report). The UI shows `id` only; `issue` is never surfaced (§2.2).                                     |
| `403`                                   | **challenge_expired** — the component transparently calls `GET /v1/challenge` again to obtain a fresh token, then enters the `error` state with a message telling the user to press Send report again. The retry reuses the freshly fetched token. |
| `429`                                   | **rate_limited** — `error` state with the server's message (or a generic "sending too quickly" message if none was provided).                                                                                                                      |
| any other non-2xx, or a network failure | **error** — `error` state with the server's message (or a generic failure message).                                                                                                                                                                |

No outcome is ever silently dropped; every branch above ends in a state the user can see.

### 2.5 Console-log capture

- Installed from the component's mount effect (not panel-open) via `installConsoleCapture(300)`
  (`src/BugReportButton/consoleCapture.ts`) — a ring buffer capped at 300 entries capturing
  `console.debug/log/info/warn/error` (always calling through to the original method), plus
  `window` `error` and `unhandledrejection` events.
- Entries are `{ level, ts_ms, text }`. `level` ∈ `debug | log | info | warn | error | network`
  (`network` is reserved for merged network entries, §2.6; console capture itself never emits it).
  Buffer eviction is FIFO (oldest dropped first) once the cap is reached.
- Capture is memory-only: nothing is persisted (no storage) and nothing is transmitted by capture
  itself — only a report the user explicitly sends includes the buffer's current contents.
- The panel exposes the buffer via the **Console errors** disclosure (§2.7), default collapsed,
  showing the entry count in a badge. A **Remove from report** action clears the buffer
  immediately, which also drops it from the next submission.
- Uninstalled (original console methods restored, listeners removed) on the component's unmount.

### 2.6 Network-error capture

- Installed from the same mount effect via `installNetworkCapture(100)`
  (`src/BugReportButton/networkCapture.ts`): wraps `window.fetch` and
  `XMLHttpRequest.prototype.open/send` into a ring buffer capped at 100 entries.
- **What is recorded:** a request that THROWS (network failure / CORS / abort — for XHR, status 0
  at `loadend`), or resolves with HTTP status ≥ 400. Successful requests are never recorded.
- **Entry shape:** `{ method, url, status, duration_ms, ts_ms }` where `status` is the HTTP status
  number or the literal `"failed"`, and `ts_ms` is when the request started.
- **Privacy:** the recorded `url` is sanitized — query string and hash are ALWAYS stripped (they
  routinely carry tokens/PII) and the result is truncated to 200 chars. Request/response BODIES and
  HEADERS are never captured.
- **Pure passive observation (hard rule):** the wrap forwards every argument untouched, returns
  the exact same `Response`/result object, and rethrows the exact same rejection reason. All
  recording is fail-silent — a capture bug must never break or alter a host-app request. The
  originals are restored on unmount.
- **Payload merging:** at submit, network entries are formatted as `ConsoleLogEntry`s with
  `level: "network"` and `text: "<METHOD> <url> → <status> (<duration>ms)"` (e.g.
  `GET https://api.example/data → 502 (1240ms)`), merged with the console buffer, sorted by
  `ts_ms`, and sent in the SAME `console_logs` field — no dedicated payload field, so the server
  and GitHub-issue rendering need no change.
- The panel exposes the buffer via the **Network errors** disclosure (§2.7), default collapsed,
  count-badged, with its own **Remove from report** action (clears the buffer + excludes it from
  the next submission).
- The Diagnostics area always shows an instruction line: when either buffer is non-empty, it says
  errors are captured automatically and asks the user to describe anything not listed; when both
  are empty, it asks the user to include any error they saw in the description.

### 2.7 Presentation & styling

- **Scoped stylesheet.** All styling lives in one stylesheet string (`buildStylesheet()` in
  `src/BugReportButton/styles.ts`), injected as a `<style id="digbr-styles">` element while at
  least one instance is mounted (ref-counted; removed after the last unmount). Every rule is
  scoped under a `digbr-` class prefix — no global selectors, no element selectors, nothing that
  can leak into or depend on host CSS. No external resource is referenced (CSP-safe); icons are
  inline SVG.
- **Theming** is per-instance via CSS custom properties (`--digbr-accent`, `--digbr-accent-2`)
  set inline on the widget roots from the `theme` prop.
- **Dark mode** via `@media (prefers-color-scheme: dark)` (full token swap — surfaces, inks,
  borders); **motion** (panel entrance, hover lifts, success pop) is disabled under
  `@media (prefers-reduced-motion: reduce)`; **small screens** (≤520px) render the panel as a
  full-width bottom sheet.
- **Structure:** launcher = a 56px circular gradient FAB with an inline-SVG bug glyph; panel = an
  elevated card (gradient hairline, header with icon chip + title + subtitle + close, scrollable
  body) containing the form, the screenshot section (framed preview thumbnail + overlay Remove
  pill + "Attach image"/"Replace image" file control + "Capture screen" opt-in), the Diagnostics
  disclosures, the error banner, the primary Send button, and a privacy footnote.
- The console/network sections use the ARIA disclosure pattern: a real `<button>` with
  `aria-expanded` + `aria-controls` referencing an always-present region (`hidden` when
  collapsed) — NOT a native `<details>/<summary>`.
- The file-attach control is a styled twin covered by the real (opacity-0, full-size) file input,
  so the visible button IS the input's native hit target.

### 2.8 App-version resolution

`resolveAppVersion(explicit?: string): string | undefined` (exported) resolves the value sent as
`app_version`, first non-empty match wins:

1. the `appVersion` prop,
2. `<meta name="app-version" content="…">` in the document,
3. `window.__APP_VERSION__` when it is a string,
4. `undefined` (the field is omitted from the payload).

Values are trimmed; empty/whitespace-only and non-string values are skipped. This lets a host app
expose its version once (meta tag or global) instead of plumbing a prop to every render site.

### 2.9 Accessibility

Conformance target: **WCAG 2.2 AA**, machine-verified with `@axe-core/playwright` on the OPEN
panel (tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`) with **no rule suppressions —
including `target-size`**.

- Launcher: a real `<button>`, `aria-label="Report a bug"`, `aria-haspopup="dialog"`,
  `aria-expanded` reflecting panel state.
- Panel: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing at the panel heading.
  The panel's title bar is a plain container (NOT a `<header>` element): a `role="dialog"` does not
  scope a descendant `<header>` out of its implicit `banner` role, and the host app shell already
  owns the document's single banner landmark. Introducing a second banner fails WCAG 2.2
  (axe `landmark-unique`), so the widget MUST NOT emit a `banner` (or any other page landmark).
- **Target size (WCAG 2.5.8):** every interactive target is at least 24×24 CSS px; the launcher
  (56px) and the primary Send/Done action (44px min-height) exceed the comfort size. The two
  controls that historically failed (the file-input control and the console toggle) are now a
  full-size covered file input (§2.7) and a ≥40px disclosure button.
- **Focus trap** (`src/BugReportButton/useFocusTrap.ts`): on open, focus moves to the first
  focusable element in the panel; Tab/Shift+Tab cycle within the panel's focusable elements only
  (never escaping to the page behind it); `Escape` closes the panel; on close, focus returns to
  whatever had it before the panel opened (in practice, the launcher button).
- The honeypot input is excluded from the tab order (`tabIndex={-1}`) and from the accessibility
  tree (`aria-hidden="true"`), on top of being visually off-screen — three independent hides so no
  real usage path (visual, keyboard, or screen-reader) can reach it.
- A `role="status"` `aria-live="polite"` region announces state transitions (sending / success /
  error text) to assistive technology; it is visually hidden (clip-based, not `display: none`, so
  it stays in the accessibility tree) since the same information is also shown visually.
- Motion respects `prefers-reduced-motion` (§2.7).
- Every form control has an associated `<label htmlFor>` or `aria-label`; the scrollable log lists
  are keyboard-focusable (`tabIndex={0}`) with `aria-label`s.
- Stable `data-testid`s are attached to every interactive element and state container (see the
  component source for the full list) so scripted/agent clients can drive the panel
  deterministically. The 0.1.0 test ids are preserved; 0.1.1 adds `bugreport-network-details`,
  `bugreport-network-toggle`, `bugreport-network-list`, `bugreport-network-remove`,
  `bugreport-screen-capture`, and `bugreport-diagnostics-hint`.

---

## 3. Conformance

- The wire contract in §2.4 MUST match bugreport.dig.net's own `SPEC.md` (the server side of the
  same contract) byte-for-byte in field names and semantics. A change to either side is made in
  the same unit of work as the other, per the ecosystem's `SYSTEM.md` cross-repo interaction rule.
- Field names are wire contracts and are never renamed; new optional fields may be added
  additively. The `"network"` console-log level (§2.6) is an additive value within the existing
  `console_logs` field.
