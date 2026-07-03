import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import type { BugReportButtonProps } from "./types";
import type { ConsoleLogEntry } from "./consoleCapture";
import { installConsoleCapture } from "./consoleCapture";
import { attemptAutoCapture, readFileAsDataUrl } from "./screenshotCapture";
import { fetchChallenge, submitReport } from "./api";
import type { IssueRef } from "./api";
import { useFocusTrap } from "./useFocusTrap";
import * as styles from "./styles";

const DEFAULT_API_BASE = "https://api.bugreport.dig.net";
const CONSOLE_BUFFER_SIZE = 300;

type Status = "idle" | "sending" | "success" | "error";

/**
 * A floating 🐞 button + report panel that any DIG React app embeds to let users file a bug
 * report against a specific GitHub repo. Talks to the bugreport.dig.net service (or a compatible
 * `apiBase`) using the challenge/honeypot/timing abuse-protection contract — see SPEC.md.
 *
 * Privacy: nothing is transmitted until the user explicitly presses "Send report"; the panel
 * always shows exactly what will be sent (screenshot + console preview), each removable.
 */
export function BugReportButton(props: BugReportButtonProps): JSX.Element {
  const { repo, apiBase = DEFAULT_API_BASE, position = "bottom-right", appVersion, theme } = props;
  const accent = theme?.accentColor ?? styles.DEFAULT_ACCENT_COLOR;

  const [panelOpen, setPanelOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [reporterContact, setReporterContact] = useState("");
  const [hp, setHp] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [consoleEntries, setConsoleEntries] = useState<ConsoleLogEntry[]>([]);
  const [consoleExpanded, setConsoleExpanded] = useState(false);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [openedAt, setOpenedAt] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: string; issue: IssueRef | null } | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);
  const consoleHandleRef = useRef<ReturnType<typeof installConsoleCapture> | null>(null);

  // Capture console/runtime errors from MOUNT, independent of whether the panel is open, so a
  // report opened after the bug happened still shows the log leading up to it.
  useEffect(() => {
    const handle = installConsoleCapture(CONSOLE_BUFFER_SIZE);
    consoleHandleRef.current = handle;
    const unsubscribe = handle.subscribe(() => setConsoleEntries(handle.getEntries()));
    return () => {
      unsubscribe();
      handle.uninstall();
      consoleHandleRef.current = null;
    };
  }, []);

  const refreshChallenge = useCallback(async (): Promise<string | null> => {
    try {
      const challenge = await fetchChallenge(apiBase);
      setChallengeToken(challenge.token);
      return challenge.token;
    } catch {
      setChallengeToken(null);
      return null;
    }
  }, [apiBase]);

  // Each time the panel opens: reset the draft, start the abuse-protection clock, fetch a fresh
  // challenge, and attempt a best-effort screenshot (the user reviews + can remove it before send).
  useEffect(() => {
    if (!panelOpen) return;
    let cancelled = false;

    setTitle("");
    setDescription("");
    setReporterContact("");
    setHp("");
    setScreenshot(null);
    setConsoleExpanded(false);
    setStatus("idle");
    setErrorMessage(null);
    setResult(null);
    setOpenedAt(Date.now());
    setConsoleEntries(consoleHandleRef.current?.getEntries() ?? []);

    void refreshChallenge();
    void attemptAutoCapture().then((dataUrl) => {
      if (!cancelled && dataUrl) setScreenshot(dataUrl);
    });

    return () => {
      cancelled = true;
    };
  }, [panelOpen, refreshChallenge]);

  useFocusTrap(panelRef, panelOpen, () => setPanelOpen(false));

  const handleFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    void readFileAsDataUrl(file).then((dataUrl) => setScreenshot(dataUrl));
  }, []);

  const handleRemoveScreenshot = useCallback(() => setScreenshot(null), []);

  const handleRemoveConsole = useCallback(() => {
    consoleHandleRef.current?.clear();
    setConsoleEntries([]);
  }, []);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (description.trim() === "" || status === "sending") return;

      setStatus("sending");
      setErrorMessage(null);

      const token = challengeToken ?? (await refreshChallenge());
      if (!token) {
        setStatus("error");
        setErrorMessage("Could not start a report session. Please try again.");
        return;
      }

      const outcome = await submitReport(apiBase, {
        repo,
        title: title.trim() || undefined,
        description: description.trim(),
        reporter_contact: reporterContact.trim() || undefined,
        url: typeof window !== "undefined" ? window.location.href : undefined,
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
        app_version: appVersion,
        console_logs: consoleEntries.length > 0 ? consoleEntries : undefined,
        screenshot: screenshot ?? undefined,
        challenge_token: token,
        hp,
        opened_at_ms: openedAt ?? Date.now(),
      });

      if (outcome.status === "accepted") {
        setStatus("success");
        setResult({ id: outcome.id, issue: outcome.issue });
        return;
      }
      if (outcome.status === "challenge_expired") {
        await refreshChallenge();
        setStatus("error");
        setErrorMessage("Your report session expired. Press Send report to try again.");
        return;
      }
      if (outcome.status === "rate_limited") {
        setStatus("error");
        setErrorMessage(
          outcome.message ?? "You're sending reports too quickly. Please wait a moment and try again.",
        );
        return;
      }
      setStatus("error");
      setErrorMessage(outcome.message);
    },
    [
      apiBase,
      appVersion,
      challengeToken,
      consoleEntries,
      description,
      hp,
      openedAt,
      refreshChallenge,
      repo,
      reporterContact,
      screenshot,
      status,
      title,
    ],
  );

  const statusText =
    status === "sending"
      ? "Sending report…"
      : status === "success"
        ? "Report sent."
        : status === "error"
          ? (errorMessage ?? "Something went wrong.")
          : "";

  const submitDisabled = status === "sending" || description.trim() === "";
  const submitLabel = status === "sending" ? "Sending…" : status === "error" ? "Retry" : "Send report";

  return (
    <>
      <button
        type="button"
        data-testid="bugreport-launcher"
        aria-haspopup="dialog"
        aria-expanded={panelOpen}
        aria-label="Report a bug"
        onClick={() => setPanelOpen((open) => !open)}
        style={styles.launcherStyle(position, accent)}
      >
        <span aria-hidden="true">🐞</span>
      </button>

      {panelOpen && (
        <div style={styles.overlayStyle} data-testid="bugreport-overlay">
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="bugreport-heading"
            data-testid="bugreport-panel"
            style={{ position: "relative", ...styles.panelStyle(position, accent) }}
          >
            <h2 id="bugreport-heading" style={styles.headingStyle}>
              Report a bug
            </h2>
            <button
              type="button"
              data-testid="bugreport-cancel"
              aria-label="Close report form"
              onClick={() => setPanelOpen(false)}
              style={styles.closeButtonStyle(accent)}
            >
              ×
            </button>

            <div role="status" aria-live="polite" data-testid="bugreport-status" style={styles.visuallyHiddenStyle}>
              {statusText}
            </div>

            {status === "success" && result ? (
              <div data-testid="bugreport-success" style={styles.successStyle}>
                <p>Thanks — your report was sent.</p>
                <p>
                  Report ID: <code data-testid="bugreport-report-id">{result.id}</code>
                </p>
                {result.issue && (
                  <p>
                    <a
                      href={result.issue.url}
                      target="_blank"
                      rel="noreferrer"
                      data-testid="bugreport-issue-link"
                    >
                      View GitHub issue #{result.issue.number}
                    </a>
                  </p>
                )}
                <button
                  type="button"
                  data-testid="bugreport-done"
                  onClick={() => setPanelOpen(false)}
                  style={styles.primaryButtonStyle(accent, false)}
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={(event) => void handleSubmit(event)} noValidate>
                {/* Honeypot: real users never see or fill this. A non-empty value marks the
                    submission as a bot to the server (§ abuse-protection contract). Hidden from
                    sighted users (off-screen) AND assistive tech (aria-hidden + tabIndex -1). */}
                <input
                  type="text"
                  name="email_confirm"
                  value={hp}
                  onChange={(event) => setHp(event.target.value)}
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  data-testid="bugreport-honeypot"
                  style={styles.honeypotStyle}
                />

                <div style={styles.fieldGroupStyle}>
                  <label htmlFor="bugreport-title" style={styles.labelStyle}>
                    Title (optional)
                  </label>
                  <input
                    id="bugreport-title"
                    data-testid="bugreport-title-input"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    disabled={status === "sending"}
                    style={styles.inputStyle}
                  />
                </div>

                <div style={styles.fieldGroupStyle}>
                  <label htmlFor="bugreport-description" style={styles.labelStyle}>
                    What happened? *
                  </label>
                  <textarea
                    id="bugreport-description"
                    data-testid="bugreport-description-input"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    disabled={status === "sending"}
                    style={styles.textareaStyle}
                    required
                  />
                </div>

                <div style={styles.fieldGroupStyle}>
                  <label htmlFor="bugreport-contact" style={styles.labelStyle}>
                    Contact (optional)
                  </label>
                  <input
                    id="bugreport-contact"
                    data-testid="bugreport-contact-input"
                    value={reporterContact}
                    onChange={(event) => setReporterContact(event.target.value)}
                    disabled={status === "sending"}
                    style={styles.inputStyle}
                  />
                </div>

                <div style={styles.fieldGroupStyle}>
                  <span style={styles.labelStyle} id="bugreport-screenshot-label">
                    Screenshot
                  </span>
                  {screenshot ? (
                    <>
                      <img
                        src={screenshot}
                        alt="Screenshot preview that will be sent with this report"
                        data-testid="bugreport-screenshot-preview"
                        style={styles.screenshotPreviewStyle}
                      />
                      <button
                        type="button"
                        data-testid="bugreport-screenshot-remove"
                        onClick={handleRemoveScreenshot}
                        style={styles.secondaryButtonStyle}
                      >
                        Remove screenshot
                      </button>
                    </>
                  ) : (
                    <p style={{ margin: 0, fontSize: 12, color: "#6a5f77" }}>
                      No screenshot captured yet. Attach one:
                    </p>
                  )}
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    aria-labelledby="bugreport-screenshot-label"
                    data-testid="bugreport-screenshot-file-input"
                    onChange={handleFileChange}
                    disabled={status === "sending"}
                  />
                </div>

                <details
                  data-testid="bugreport-console-details"
                  open={consoleExpanded}
                  onToggle={(event) => setConsoleExpanded(event.currentTarget.open)}
                >
                  <summary data-testid="bugreport-console-toggle">
                    Console log ({consoleEntries.length} entries)
                  </summary>
                  <ul data-testid="bugreport-console-list" style={styles.consoleListStyle}>
                    {consoleEntries.map((entry, index) => (
                      <li key={index}>
                        [{entry.level}] {entry.text}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    data-testid="bugreport-console-remove"
                    onClick={handleRemoveConsole}
                    style={styles.secondaryButtonStyle}
                  >
                    Remove console log
                  </button>
                </details>

                {status === "error" && (
                  <div data-testid="bugreport-error" role="alert" style={styles.errorBannerStyle}>
                    {errorMessage}
                  </div>
                )}

                <button
                  type="submit"
                  data-testid="bugreport-submit"
                  disabled={submitDisabled}
                  style={styles.primaryButtonStyle(accent, submitDisabled)}
                >
                  {submitLabel}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
