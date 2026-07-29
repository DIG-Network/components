/**
 * The full set of user-visible strings rendered by {@link BugReportButton}, as a typed
 * dictionary. `<BugReportButton>` is embedded in every DIG frontend, each of which localizes
 * into the ecosystem's locale set (see the frontend-baseline contract); a host app supplies
 * translated copy via the optional `messages` prop and the widget merges it over
 * {@link DEFAULT_MESSAGES}. Omitting the prop renders the English defaults below unchanged, so
 * this is a purely additive, backwards-compatible capability.
 *
 * Brand and scheme tokens ($DIG, XCH, DIGHub, chia://, dig://) are NON-translatable and MUST be
 * preserved verbatim inside any translated string — the current copy contains none, so no string
 * here embeds one; a future string that needs one keeps the token as a literal constant.
 */
export interface BugReportMessages {
  /** `aria-label` on the floating launcher button. */
  launcherAriaLabel: string;
  /** The panel's `<h2>` heading (also names the dialog via `aria-labelledby`). */
  panelHeading: string;
  /** The subtitle line under the heading. */
  panelSubtitle: string;
  /** `aria-label` on the panel's close (×) button. */
  closeAriaLabel: string;

  /** Label for the optional title field. */
  titleLabel: string;
  /** The "(optional)" suffix shown after optional field labels (title, contact). */
  optionalSuffix: string;
  /** Placeholder in the title input. */
  titlePlaceholder: string;
  /** Label for the required description field. */
  descriptionLabel: string;
  /** Placeholder in the description textarea. */
  descriptionPlaceholder: string;
  /** Label for the optional contact field. */
  contactLabel: string;
  /** Placeholder in the contact input. */
  contactPlaceholder: string;

  /** Label for the screenshot section. */
  screenshotLabel: string;
  /** `alt` text on the attached-screenshot preview image. */
  screenshotAlt: string;
  /** Button that removes the attached screenshot. */
  removeButton: string;
  /** Caption shown under an automatically-captured screenshot. */
  screenshotAutoCaption: string;
  /** Caption shown when no screenshot is attached. */
  screenshotEmptyCaption: string;
  /** Attach-image button when a screenshot is already attached. */
  replaceImageButton: string;
  /** Attach-image button when no screenshot is attached. */
  attachImageButton: string;
  /** `aria-label` for the file input when a screenshot is already attached. */
  replaceImageAriaLabel: string;
  /** `aria-label` for the file input when no screenshot is attached. */
  attachImageAriaLabel: string;
  /** Button that opens the browser screen-share picker. */
  captureScreenButton: string;
  /** Caption explaining the "Capture screen" opt-in. */
  captureScreenCaption: string;

  /** Label for the diagnostics section. */
  diagnosticsLabel: string;
  /** Diagnostics hint when console/network errors WERE captured. */
  diagnosticsHintWithErrors: string;
  /** Diagnostics hint when NO console/network errors were captured. */
  diagnosticsHintNoErrors: string;
  /** Label of the console-errors disclosure. */
  consoleErrorsLabel: string;
  /** Label of the network-errors disclosure. */
  networkErrorsLabel: string;
  /** `aria-label` on the scrollable captured-console-errors list. */
  consoleListAriaLabel: string;
  /** `aria-label` on the scrollable captured-network-errors list. */
  networkListAriaLabel: string;
  /** Placeholder shown inside a disclosure with no captured entries. */
  logEmpty: string;
  /** Button that drops the captured console/network log from the report. */
  removeFromReportButton: string;

  /** Primary submit button in its default state. */
  submitButton: string;
  /** Submit button label while a report is being sent. */
  submitButtonSending: string;
  /** Submit button label after a failed attempt (doubles as retry). */
  submitButtonRetry: string;
  /** Footnote reassuring the user nothing is sent until submit. */
  submitFootnote: string;

  /** `aria-live` status announcement while sending. */
  statusSending: string;
  /** `aria-live` status announcement on success. */
  statusSuccess: string;
  /** `aria-live` fallback announcement when an error carries no message. */
  statusGenericError: string;

  /** Heading of the success view. */
  successHeading: string;
  /** Explanatory note above the report reference id on success. */
  successNote: string;
  /** Button that closes the panel from the success view. */
  doneButton: string;

  /** Error shown when a challenge session could not be started. */
  sessionStartError: string;
  /** Error shown when the challenge token expired and must be retried. */
  sessionExpiredError: string;
  /** Fallback error when the server rate-limits without its own message. */
  rateLimitedFallback: string;
  /** Fallback error when the report could not be sent due to a transport failure. */
  networkErrorFallback: string;
  /**
   * Fallback error when the server rejects the report with no message envelope. The failing HTTP
   * status is appended in parentheses (e.g. "Request failed (500)."), so this string carries only
   * the human-readable prefix.
   */
  requestFailedFallback: string;
}

/**
 * The canonical English copy for {@link BugReportButton}, and the single source of defaults the
 * widget merges a partial `messages` override over. Exported so consumers can spread/extend it
 * (e.g. translate a subset and keep the rest English).
 */
export const DEFAULT_MESSAGES: BugReportMessages = {
  launcherAriaLabel: "Report a bug",
  panelHeading: "Report a bug",
  panelSubtitle: "Goes straight to the team that builds this app.",
  closeAriaLabel: "Close report form",

  titleLabel: "Title",
  optionalSuffix: "(optional)",
  titlePlaceholder: "One-line summary",
  descriptionLabel: "What happened?",
  descriptionPlaceholder: "What did you do, what did you expect, and what went wrong?",
  contactLabel: "Contact",
  contactPlaceholder: "Email or handle, if you'd like a reply",

  screenshotLabel: "Screenshot",
  screenshotAlt: "Screenshot preview that will be sent with this report",
  removeButton: "Remove",
  screenshotAutoCaption:
    "Captured automatically — the report panel itself is never included. Remove or replace it if it isn't helpful.",
  screenshotEmptyCaption: "No screenshot attached. Add one below if it helps explain the problem.",
  replaceImageButton: "Replace image",
  attachImageButton: "Attach image",
  replaceImageAriaLabel: "Replace the screenshot image",
  attachImageAriaLabel: "Attach a screenshot image",
  captureScreenButton: "Capture screen",
  captureScreenCaption:
    '"Capture screen" opens your browser\'s share dialog — use it when the automatic shot misses something (embedded frames, 3D content).',

  diagnosticsLabel: "Diagnostics",
  diagnosticsHintWithErrors:
    "Console and network errors are captured automatically. If you saw an error that isn't listed, describe it above.",
  diagnosticsHintNoErrors:
    "No console or network errors were captured on this page. If you saw an error message, please include it in your description.",
  consoleErrorsLabel: "Console errors",
  networkErrorsLabel: "Network errors",
  consoleListAriaLabel: "Captured console errors",
  networkListAriaLabel: "Captured network errors",
  logEmpty: "Nothing captured on this page.",
  removeFromReportButton: "Remove from report",

  submitButton: "Send report",
  submitButtonSending: "Sending…",
  submitButtonRetry: "Retry",
  submitFootnote: "Nothing is sent until you press Send report.",

  statusSending: "Sending report…",
  statusSuccess: "Report sent.",
  statusGenericError: "Something went wrong.",

  successHeading: "Report sent — thank you!",
  successNote: "The team will take a look. Keep this reference if you'd like to follow up:",
  doneButton: "Done",

  sessionStartError: "Could not start a report session. Please try again.",
  sessionExpiredError: "Your report session expired. Press Send report to try again.",
  rateLimitedFallback: "You're sending reports too quickly. Please wait a moment and try again.",
  networkErrorFallback: "Network error — could not send the report.",
  requestFailedFallback: "Request failed",
};
