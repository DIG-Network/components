/**
 * In-memory console + error ring buffer used by <BugReportButton> to show the reporter
 * exactly what will be sent in a bug report (CLAUDE.md privacy rule: nothing is
 * transmitted or persisted beyond page memory until the user explicitly sends).
 *
 * Wraps console.debug/log/info/warn/error (always calling through to the original so
 * devtools output is unaffected) and listens for window "error" + "unhandledrejection",
 * appending every event to a capped ring buffer. Capture starts at `installConsoleCapture()`
 * (called from the component's mount effect) and stops at `uninstall()` (unmount), which
 * restores the original console methods and removes the window listeners.
 */

/** Severity level of a captured console/runtime entry. */
export type ConsoleLogLevel = "debug" | "log" | "info" | "warn" | "error";

/** One captured console call or runtime error, as sent in a bug report's `console_logs`. */
export interface ConsoleLogEntry {
  level: ConsoleLogLevel;
  ts_ms: number;
  text: string;
}

/** Handle returned by {@link installConsoleCapture}. */
export interface ConsoleCaptureHandle {
  /** Current buffer contents, oldest first. */
  getEntries(): ConsoleLogEntry[];
  /** Empty the buffer (does not stop capturing new entries). */
  clear(): void;
  /** Register a listener invoked after every buffer mutation (push or clear). Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** Restore the original console methods and remove window listeners. Idempotent. */
  uninstall(): void;
}

const CONSOLE_METHODS = ["debug", "log", "info", "warn", "error"] as const;

/** Format console arguments into one line of text, tolerating circular objects. */
function formatArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === "string") return arg;
      if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
      if (typeof arg === "object" && arg !== null) {
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    })
    .join(" ");
}

/**
 * Install console + window error capture. Safe to call multiple times (each call installs
 * an independent buffer + wrap layer); pair every install with an `uninstall()`.
 *
 * @param maxEntries Ring buffer capacity (default 300 per the bug-report widget spec).
 */
export function installConsoleCapture(maxEntries = 300): ConsoleCaptureHandle {
  const entries: ConsoleLogEntry[] = [];
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of listeners) listener();
  };

  const push = (level: ConsoleLogLevel, text: string) => {
    entries.push({ level, ts_ms: Date.now(), text });
    if (entries.length > maxEntries) {
      entries.splice(0, entries.length - maxEntries);
    }
    notify();
  };

  const originals: Partial<Record<(typeof CONSOLE_METHODS)[number], (...args: unknown[]) => void>> = {};

  for (const method of CONSOLE_METHODS) {
    const original = console[method];
    originals[method] = original;
    console[method] = (...args: unknown[]) => {
      original(...args);
      push(method, formatArgs(args));
    };
  }

  const handleWindowError = (event: ErrorEvent) => {
    const location = event.filename ? ` (${event.filename}:${event.lineno}:${event.colno})` : "";
    push("error", `${event.message}${location}`);
  };

  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const text =
      reason instanceof Error ? `${reason.name}: ${reason.message}` : formatArgs([reason]);
    push("error", `Unhandled rejection: ${text}`);
  };

  window.addEventListener("error", handleWindowError);
  window.addEventListener("unhandledrejection", handleUnhandledRejection);

  let uninstalled = false;

  return {
    getEntries: () => entries.slice(),
    clear: () => {
      entries.length = 0;
      notify();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    uninstall: () => {
      if (uninstalled) return;
      uninstalled = true;
      for (const method of CONSOLE_METHODS) {
        const original = originals[method];
        if (original) console[method] = original;
      }
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
      listeners.clear();
    },
  };
}
