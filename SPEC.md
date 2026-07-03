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
  code-generation. It runs under a strict `script-src 'self'` CSP with no `unsafe-eval`.
- **Side effects:** `sideEffects: false`. Importing any export must not mutate global state by
  itself; global state (console wrapping, event listeners) is only installed when a component that
  needs it is mounted, and torn down on unmount.
- **Structure:** each component lives in its own `src/<ComponentName>/` directory (component +
  types + supporting modules + tests, co-located) and is re-exported from the package root
  `src/index.ts`. New components are added the same way; this file gains a new numbered section
  per component.

---

## 2. `<BugReportButton>`

### 2.1 Props

| Prop | Type | Required | Default |
|---|---|---|---|
| `repo` | `string` | yes | — |
| `apiBase` | `string` | no | `"https://api.bugreport.dig.net"` |
| `position` | `"bottom-right" \| "bottom-left"` | no | `"bottom-right"` |
| `appVersion` | `string` | no | `undefined` |
| `theme` | `{ accentColor?: string }` | no | `{ accentColor: "#7a3dff" }` |

`repo` is passed through verbatim to the server, which validates it against its own allowlist
(§3.4 of bugreport.dig.net's `SPEC.md`). This package does not itself validate `repo` — the server
is the single source of truth for the allowlist so it can change without a client release.

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
- **success** — set when the server accepts the report (`200`/`202`). Shows the report `id` and,
  when present, a link to the created GitHub issue. The form is unmounted in favor of the success
  view; closing the panel (Escape, the × button, or "Done") is the only action available.
- **error** — set on any non-accepted outcome. The form REMAINS mounted with the user's draft
  intact (title/description/contact/screenshot/console selection are never cleared on error) so a
  retry costs nothing. The submit button doubles as the retry action; its label changes to
  "Retry".

Opening the panel (`panelOpen` transitioning false → true) always resets the draft to a blank
state (title/description/contact/screenshot cleared, console selection reset to "not yet
reviewed") and:

1. Records `openedAt = Date.now()` (sent as `opened_at_ms`).
2. Calls `GET {apiBase}/v1/challenge` (§2.4) and stores the resulting token.
3. Attempts a best-effort auto-screenshot (§2.3); failure is silent and leaves the screenshot slot
   empty (the file-attach fallback remains available).

Closing the panel does not send anything and does not need network access.

### 2.3 Screenshot capture

1. **Auto-capture attempt**, on panel open: `navigator.mediaDevices.getDisplayMedia({ video: true
   })` (if the API exists). On success, one frame is drawn to an off-DOM `<canvas>` and exported as
   a PNG data URL (`canvas.toDataURL("image/png")`); all media tracks are stopped immediately
   after the frame is captured, whether capture succeeded or not.
2. **Fallback**: a plain `<input type="file" accept="image/png,image/jpeg">`. Selecting a file
   reads it as a data URL (`FileReader.readAsDataURL`) and replaces any auto-captured screenshot.
3. Whatever the source, the screenshot is rendered as an `<img>` preview with a **Remove** button
   that clears it (excluding it from the next submission). There is no size-capping or
   re-encoding on the client — the server enforces the size cap (2 MiB decoded) and rejects
   oversized/invalid images; a client-side compression pass is a possible future enhancement, not
   a current guarantee.
4. Nothing captured by this section is ever sent automatically — it is included in the next
   `POST /v1/reports` call ONLY if still present in state when the user presses Send report.

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
  app_version?: string,              // the appVersion prop
  console_logs?: ConsoleLogEntry[],  // present only when the buffer is non-empty
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

| Status | Client outcome |
|---|---|
| `200` or `202` | **accepted** — `{ id, issue }` from the body drive the success view. `issue` is `null` when no GitHub issue was created (still a successful report). |
| `403` | **challenge_expired** — the component transparently calls `GET /v1/challenge` again to obtain a fresh token, then enters the `error` state with a message telling the user to press Send report again. The retry reuses the freshly fetched token. |
| `429` | **rate_limited** — `error` state with the server's message (or a generic "sending too quickly" message if none was provided). |
| any other non-2xx, or a network failure | **error** — `error` state with the server's message (or a generic failure message). |

No outcome is ever silently dropped; every branch above ends in a state the user can see.

### 2.5 Console-log capture

- Installed from the component's mount effect (not panel-open) via `installConsoleCapture(300)`
  (`src/BugReportButton/consoleCapture.ts`) — a ring buffer capped at 300 entries capturing
  `console.debug/log/info/warn/error` (always calling through to the original method), plus
  `window` `error` and `unhandledrejection` events.
- Entries are `{ level, ts_ms, text }`. `level` ∈ `debug | log | info | warn | error`. Buffer
  eviction is FIFO (oldest dropped first) once the cap is reached.
- Capture is memory-only: nothing is persisted (no storage) and nothing is transmitted by capture
  itself — only a report the user explicitly sends includes the buffer's current contents.
- The panel exposes the buffer via a collapsible `<details>` (`bugreport-console-details`),
  default collapsed, showing the entry count in the summary and the full text when expanded. A
  **Remove console log** action clears the buffer immediately (`consoleCapture.clear()`), which
  also drops it from the next submission (the payload's `console_logs` field is only populated
  when the buffer is non-empty at submit time).
- Uninstalled (original console methods restored, listeners removed) on the component's unmount.

### 2.6 Accessibility

- Launcher: a real `<button>`, `aria-label="Report a bug"`, `aria-haspopup="dialog"`,
  `aria-expanded` reflecting panel state.
- Panel: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing at the panel heading.
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
- No motion/animation is used, so there is nothing to gate behind `prefers-reduced-motion` today;
  if transitions are added later they MUST respect it.
- Every form control has a associated `<label htmlFor>` (or `aria-labelledby` for the file input).
- Stable `data-testid`s are attached to every interactive element and state container (see the
  component source for the full list) so scripted/agent clients can drive the panel
  deterministically.

### 2.7 Styling

All styling is inline (`style` props built from `src/BugReportButton/styles.ts`) — no CSS classes,
no injected `<style>` tag, no global selectors. This guarantees the component never depends on the
host page's CSS and never leaks style into it, regardless of what CSS framework (or none) the host
app uses.

---

## 3. Conformance

- The wire contract in §2.4 MUST match bugreport.dig.net's own `SPEC.md` (the server side of the
  same contract) byte-for-byte in field names and semantics. A change to either side is made in
  the same unit of work as the other, per the ecosystem's `SYSTEM.md` cross-repo interaction rule.
- Field names are wire contracts and are never renamed; new optional fields may be added
  additively.
