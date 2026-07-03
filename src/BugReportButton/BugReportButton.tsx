import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ChangeEvent, FormEvent, JSX } from "react";
import type { BugReportButtonProps } from "./types";
import type { ConsoleLogEntry } from "./consoleCapture";
import { installConsoleCapture } from "./consoleCapture";
import type { NetworkLogEntry } from "./networkCapture";
import { formatNetworkEntry, installNetworkCapture } from "./networkCapture";
import {
  captureScreenViaDisplayMedia,
  captureViewportScreenshot,
  readFileAsDataUrl,
} from "./screenshotCapture";
import { WIDGET_MARKER_ATTR } from "./domSnapshot";
import { resolveAppVersion } from "./appVersion";
import { fetchChallenge, submitReport } from "./api";
import { useFocusTrap } from "./useFocusTrap";
import { Disclosure } from "./Disclosure";
import { BugIcon, CheckIcon, CloseIcon, WarnIcon } from "./icons";
import { DEFAULT_ACCENT_COLOR, DEFAULT_ACCENT_SECONDARY, acquireStylesheet } from "./styles";

const DEFAULT_API_BASE = "https://api.bugreport.dig.net";
const CONSOLE_BUFFER_SIZE = 300;
const NETWORK_BUFFER_SIZE = 100;

type Status = "idle" | "sending" | "success" | "error";

/** Where the currently-attached screenshot came from (drives the caption under the preview). */
type ScreenshotOrigin = "auto" | "user";

/** Spread onto the widget's root elements so the DOM screenshot NEVER includes the widget. */
const widgetMarker = { [WIDGET_MARKER_ATTR]: "" } as Record<string, string>;

/** `useLayoutEffect` on the client (style must land before paint), `useEffect` under SSR. */
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** Resolve after ~two rendered frames — long enough for a visibility change to hit the screen. */
async function waitForRepaint(): Promise<void> {
  const frame = (): Promise<void> =>
    new Promise((resolve) => {
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
      else setTimeout(resolve, 32);
    });
  await frame();
  await frame();
}

/**
 * A floating bug-report button + panel that any DIG React app embeds to let users file a bug
 * report against a specific GitHub repo. Talks to the bugreport.dig.net service (or a compatible
 * `apiBase`) using the challenge/honeypot/timing abuse-protection contract — see SPEC.md.
 *
 * Privacy: nothing is transmitted until the user explicitly presses "Send report"; the panel
 * always shows exactly what will be sent (screenshot + console/network previews), each removable.
 * The automatic screenshot is a DOM rasterization of the page taken BEFORE the panel mounts and
 * excluding the widget's own UI — never a screen-share prompt (that exists only as the explicit
 * "Capture screen" opt-in).
 */
export function BugReportButton(props: BugReportButtonProps): JSX.Element {
  const { repo, apiBase = DEFAULT_API_BASE, position = "bottom-right", appVersion, theme } = props;
  const accent = theme?.accentColor ?? DEFAULT_ACCENT_COLOR;
  // A custom accent without an explicit endpoint renders solid (never a mismatched gradient).
  const accentSecondary =
    theme?.accentColorSecondary ?? (theme?.accentColor ? theme.accentColor : DEFAULT_ACCENT_SECONDARY);

  const [panelOpen, setPanelOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [reporterContact, setReporterContact] = useState("");
  const [hp, setHp] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [screenshotOrigin, setScreenshotOrigin] = useState<ScreenshotOrigin>("auto");
  const [consoleEntries, setConsoleEntries] = useState<ConsoleLogEntry[]>([]);
  const [networkEntries, setNetworkEntries] = useState<NetworkLogEntry[]>([]);
  const [consoleExpanded, setConsoleExpanded] = useState(false);
  const [networkExpanded, setNetworkExpanded] = useState(false);
  const [capturingScreen, setCapturingScreen] = useState(false);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [openedAt, setOpenedAt] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: string } | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);
  const consoleHandleRef = useRef<ReturnType<typeof installConsoleCapture> | null>(null);
  const networkHandleRef = useRef<ReturnType<typeof installNetworkCapture> | null>(null);
  // Bumped on every open/close so a stale auto-capture can never land in a newer panel session.
  const captureGenerationRef = useRef(0);

  // Scoped stylesheet: injected before first paint, ref-counted across instances.
  useIsomorphicLayoutEffect(() => acquireStylesheet(), []);

  // Capture console/runtime AND network errors from MOUNT, independent of whether the panel is
  // open, so a report opened after the bug happened still shows the events leading up to it.
  useEffect(() => {
    const consoleHandle = installConsoleCapture(CONSOLE_BUFFER_SIZE);
    const networkHandle = installNetworkCapture(NETWORK_BUFFER_SIZE);
    consoleHandleRef.current = consoleHandle;
    networkHandleRef.current = networkHandle;
    const unsubscribeConsole = consoleHandle.subscribe(() =>
      setConsoleEntries(consoleHandle.getEntries()),
    );
    const unsubscribeNetwork = networkHandle.subscribe(() =>
      setNetworkEntries(networkHandle.getEntries()),
    );
    return () => {
      unsubscribeConsole();
      unsubscribeNetwork();
      consoleHandle.uninstall();
      networkHandle.uninstall();
      consoleHandleRef.current = null;
      networkHandleRef.current = null;
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

  const closePanel = useCallback(() => {
    captureGenerationRef.current += 1; // invalidate any in-flight auto-capture
    setPanelOpen(false);
  }, []);

  /**
   * Open the panel. ORDER MATTERS: the DOM snapshot is taken synchronously inside
   * `captureViewportScreenshot()` BEFORE `setPanelOpen(true)` can mount the panel, so the
   * screenshot shows the page exactly as the user saw it — no panel, no launcher (excluded by
   * the widget marker). Everything else mirrors SPEC §2.2: reset the draft, start the
   * abuse-protection clock, fetch a fresh challenge.
   */
  const openPanel = useCallback(() => {
    const generation = captureGenerationRef.current + 1;
    captureGenerationRef.current = generation;
    const capture = captureViewportScreenshot(); // sync DOM clone happens HERE, pre-panel

    setTitle("");
    setDescription("");
    setReporterContact("");
    setHp("");
    setScreenshot(null);
    setScreenshotOrigin("auto");
    setConsoleExpanded(false);
    setNetworkExpanded(false);
    setStatus("idle");
    setErrorMessage(null);
    setResult(null);
    setOpenedAt(Date.now());
    setConsoleEntries(consoleHandleRef.current?.getEntries() ?? []);
    setNetworkEntries(networkHandleRef.current?.getEntries() ?? []);
    setPanelOpen(true);

    void refreshChallenge();
    void capture.then((dataUrl) => {
      if (dataUrl && captureGenerationRef.current === generation) {
        // Never clobber an image the user attached while the rasterization was finishing.
        setScreenshot((current) => current ?? dataUrl);
      }
    });
  }, [refreshChallenge]);

  const handleLauncherClick = useCallback(() => {
    if (panelOpen) closePanel();
    else openPanel();
  }, [panelOpen, closePanel, openPanel]);

  useFocusTrap(panelRef, panelOpen, closePanel);

  const handleFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    void readFileAsDataUrl(file).then((dataUrl) => {
      setScreenshot(dataUrl);
      setScreenshotOrigin("user");
    });
  }, []);

  /**
   * The EXPLICIT screen-capture opt-in (for content DOM rasterization can't render, e.g.
   * cross-origin iframes or WebGL). Hides the widget's own chrome for the duration so the
   * captured frame can't include the report panel covering the page.
   */
  const handleScreenCapture = useCallback(async () => {
    setCapturingScreen(true);
    try {
      await waitForRepaint(); // let the visibility change land before the picker opens
      const dataUrl = await captureScreenViaDisplayMedia();
      if (dataUrl) {
        setScreenshot(dataUrl);
        setScreenshotOrigin("user");
      }
    } finally {
      setCapturingScreen(false);
    }
  }, []);

  const handleRemoveScreenshot = useCallback(() => setScreenshot(null), []);

  const handleRemoveConsole = useCallback(() => {
    consoleHandleRef.current?.clear();
    setConsoleEntries([]);
  }, []);

  const handleRemoveNetwork = useCallback(() => {
    networkHandleRef.current?.clear();
    setNetworkEntries([]);
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

      // Network errors ride the SAME console_logs field (level "network"), chronologically
      // interleaved, so the server + GitHub issue template need no change to show them.
      const mergedLogs = [...consoleEntries, ...networkEntries.map(formatNetworkEntry)].sort(
        (a, b) => a.ts_ms - b.ts_ms,
      );

      const outcome = await submitReport(apiBase, {
        repo,
        title: title.trim() || undefined,
        description: description.trim(),
        reporter_contact: reporterContact.trim() || undefined,
        url: typeof window !== "undefined" ? window.location.href : undefined,
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
        app_version: resolveAppVersion(appVersion),
        console_logs: mergedLogs.length > 0 ? mergedLogs : undefined,
        screenshot: screenshot ?? undefined,
        challenge_token: token,
        hp,
        opened_at_ms: openedAt ?? Date.now(),
      });

      if (outcome.status === "accepted") {
        setStatus("success");
        setResult({ id: outcome.id });
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
      networkEntries,
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

  const sending = status === "sending";
  const submitDisabled = sending || description.trim() === "";
  const submitLabel = sending ? "Sending…" : status === "error" ? "Retry" : "Send report";

  const hasDiagnostics = consoleEntries.length > 0 || networkEntries.length > 0;
  const diagnosticsHint = hasDiagnostics
    ? "Console and network errors are captured automatically. If you saw an error that isn't listed, describe it above."
    : "No console or network errors were captured on this page. If you saw an error message, please include it in your description.";

  const accentVars = {
    "--digbr-accent": accent,
    "--digbr-accent-2": accentSecondary,
  } as CSSProperties;
  const side = position === "bottom-left" ? "digbr-left" : "digbr-right";
  const capturingClass = capturingScreen ? " digbr-capturing" : "";

  return (
    <>
      <button
        type="button"
        className={`digbr-root digbr-launcher ${side}${capturingClass}`}
        data-testid="bugreport-launcher"
        aria-haspopup="dialog"
        aria-expanded={panelOpen}
        aria-label="Report a bug"
        onClick={handleLauncherClick}
        style={accentVars}
        {...widgetMarker}
      >
        <BugIcon />
      </button>

      {panelOpen && (
        <div
          className={`digbr-root digbr-overlay ${side}${capturingClass}`}
          data-testid="bugreport-overlay"
          style={accentVars}
          {...widgetMarker}
        >
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="bugreport-heading"
            data-testid="bugreport-panel"
            className="digbr-panel"
          >
            {/* Plain container, NOT a <header>: a role=dialog does not scope a descendant
                <header> out of the implicit `banner` role, and every host app shell already
                renders its own banner. Two banner landmarks fail WCAG 2.2 (axe landmark-unique).
                The dialog is named via aria-labelledby → the <h2> below. */}
            <div className="digbr-header">
              <span className="digbr-header-icon" aria-hidden="true">
                <BugIcon size={20} />
              </span>
              <div className="digbr-header-text">
                <h2 id="bugreport-heading" className="digbr-title">
                  Report a bug
                </h2>
                <p className="digbr-subtitle">Goes straight to the team that builds this app.</p>
              </div>
              <button
                type="button"
                className="digbr-close"
                data-testid="bugreport-cancel"
                aria-label="Close report form"
                onClick={closePanel}
              >
                <CloseIcon />
              </button>
            </div>

            <div role="status" aria-live="polite" data-testid="bugreport-status" className="digbr-sr-only">
              {statusText}
            </div>

            <div className="digbr-body">
              {status === "success" && result ? (
                <div data-testid="bugreport-success" className="digbr-success">
                  <span className="digbr-success-check" aria-hidden="true">
                    <CheckIcon />
                  </span>
                  <h3 className="digbr-success-title">Report sent — thank you!</h3>
                  <p className="digbr-success-note">
                    The team will take a look. Keep this reference if you'd like to follow up:
                  </p>
                  <code className="digbr-ref" data-testid="bugreport-report-id">
                    {result.id}
                  </code>
                  <button
                    type="button"
                    className="digbr-btn-primary"
                    data-testid="bugreport-done"
                    onClick={closePanel}
                  >
                    Done
                  </button>
                </div>
              ) : (
                <form className="digbr-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
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
                    className="digbr-honeypot"
                  />

                  <div className="digbr-field">
                    <label htmlFor="bugreport-title" className="digbr-label">
                      Title <span className="digbr-optional">(optional)</span>
                    </label>
                    <input
                      id="bugreport-title"
                      className="digbr-input"
                      data-testid="bugreport-title-input"
                      placeholder="One-line summary"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      disabled={sending}
                    />
                  </div>

                  <div className="digbr-field">
                    <label htmlFor="bugreport-description" className="digbr-label">
                      What happened? <span className="digbr-req" aria-hidden="true">*</span>
                    </label>
                    <textarea
                      id="bugreport-description"
                      className="digbr-textarea"
                      data-testid="bugreport-description-input"
                      placeholder="What did you do, what did you expect, and what went wrong?"
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      disabled={sending}
                      required
                    />
                  </div>

                  <div className="digbr-field">
                    <label htmlFor="bugreport-contact" className="digbr-label">
                      Contact <span className="digbr-optional">(optional)</span>
                    </label>
                    <input
                      id="bugreport-contact"
                      className="digbr-input"
                      data-testid="bugreport-contact-input"
                      placeholder="Email or handle, if you'd like a reply"
                      value={reporterContact}
                      onChange={(event) => setReporterContact(event.target.value)}
                      disabled={sending}
                    />
                  </div>

                  <div className="digbr-field">
                    <span className="digbr-label" id="bugreport-screenshot-label">
                      Screenshot
                    </span>
                    {screenshot ? (
                      <>
                        <div className="digbr-shot">
                          <img
                            src={screenshot}
                            alt="Screenshot preview that will be sent with this report"
                            data-testid="bugreport-screenshot-preview"
                            className="digbr-shot-img"
                          />
                          <button
                            type="button"
                            className="digbr-shot-remove"
                            data-testid="bugreport-screenshot-remove"
                            onClick={handleRemoveScreenshot}
                            disabled={sending}
                          >
                            Remove
                          </button>
                        </div>
                        {screenshotOrigin === "auto" && (
                          <p className="digbr-shot-caption">
                            Captured automatically — the report panel itself is never included.
                            Remove or replace it if it isn't helpful.
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="digbr-shot-caption">
                        No screenshot attached. Add one below if it helps explain the problem.
                      </p>
                    )}
                    <div className="digbr-attach-row">
                      <span className="digbr-filebtn">
                        <span className="digbr-btn-secondary" aria-hidden="true">
                          {screenshot ? "Replace image" : "Attach image"}
                        </span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg"
                          className="digbr-file-input"
                          aria-label={screenshot ? "Replace the screenshot image" : "Attach a screenshot image"}
                          data-testid="bugreport-screenshot-file-input"
                          onChange={handleFileChange}
                          disabled={sending}
                        />
                      </span>
                      <button
                        type="button"
                        className="digbr-btn-secondary"
                        data-testid="bugreport-screen-capture"
                        onClick={() => void handleScreenCapture()}
                        disabled={sending || capturingScreen}
                      >
                        Capture screen
                      </button>
                    </div>
                    <p className="digbr-shot-caption">
                      "Capture screen" opens your browser's share dialog — use it when the
                      automatic shot misses something (embedded frames, 3D content).
                    </p>
                  </div>

                  <div className="digbr-diagnostics">
                    <span className="digbr-label">Diagnostics</span>
                    <p className="digbr-hint" data-testid="bugreport-diagnostics-hint">
                      {diagnosticsHint}
                    </p>
                    <Disclosure
                      label="Console errors"
                      count={consoleEntries.length}
                      expanded={consoleExpanded}
                      onToggle={() => setConsoleExpanded((open) => !open)}
                      regionId="bugreport-console-region"
                      containerTestId="bugreport-console-details"
                      toggleTestId="bugreport-console-toggle"
                    >
                      {consoleEntries.length > 0 ? (
                        /* tabIndex: the list can scroll, so keyboard users must be able to
                           focus it to scroll (axe scrollable-region-focusable). */
                        <ul
                          data-testid="bugreport-console-list"
                          className="digbr-log"
                          tabIndex={0}
                          aria-label="Captured console errors"
                        >
                          {consoleEntries.map((entry, index) => (
                            <li key={index} className={`digbr-log-${entry.level}`}>
                              <span className="digbr-log-level">[{entry.level}]</span>
                              {entry.text}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="digbr-log-empty">Nothing captured on this page.</p>
                      )}
                      <div className="digbr-disclosure-actions">
                        <button
                          type="button"
                          className="digbr-btn-ghost"
                          data-testid="bugreport-console-remove"
                          onClick={handleRemoveConsole}
                          disabled={sending}
                        >
                          Remove from report
                        </button>
                      </div>
                    </Disclosure>
                    <Disclosure
                      label="Network errors"
                      count={networkEntries.length}
                      expanded={networkExpanded}
                      onToggle={() => setNetworkExpanded((open) => !open)}
                      regionId="bugreport-network-region"
                      containerTestId="bugreport-network-details"
                      toggleTestId="bugreport-network-toggle"
                    >
                      {networkEntries.length > 0 ? (
                        <ul
                          data-testid="bugreport-network-list"
                          className="digbr-log"
                          tabIndex={0}
                          aria-label="Captured network errors"
                        >
                          {networkEntries.map((entry, index) => (
                            <li key={index} className="digbr-log-network">
                              <span className="digbr-log-level">[{entry.status}]</span>
                              {entry.method} {entry.url} ({entry.duration_ms}ms)
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="digbr-log-empty">Nothing captured on this page.</p>
                      )}
                      <div className="digbr-disclosure-actions">
                        <button
                          type="button"
                          className="digbr-btn-ghost"
                          data-testid="bugreport-network-remove"
                          onClick={handleRemoveNetwork}
                          disabled={sending}
                        >
                          Remove from report
                        </button>
                      </div>
                    </Disclosure>
                  </div>

                  {status === "error" && (
                    <div data-testid="bugreport-error" role="alert" className="digbr-error">
                      <WarnIcon />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    className="digbr-btn-primary"
                    data-testid="bugreport-submit"
                    disabled={submitDisabled}
                  >
                    {submitLabel}
                  </button>
                  <p className="digbr-footnote">Nothing is sent until you press Send report.</p>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
