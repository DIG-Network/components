/**
 * In-memory NETWORK-error ring buffer used by <BugReportButton>, the sibling of
 * `consoleCapture.ts`. Wraps `window.fetch` and `XMLHttpRequest` (open/send) from the component's
 * mount effect and records an entry when a request THROWS (network failure / CORS / abort) or
 * resolves with an HTTP status >= 400. Successful requests are never recorded.
 *
 * Hard guarantees:
 * - **Pure passive observation.** The wrapped functions forward every argument untouched, return
 *   the exact same Response/result object, and rethrow the exact same rejection reason. Recording
 *   is wrapped in try/catch so a capture bug can never break the host app's requests.
 * - **Privacy.** Only method + sanitized URL (query string + hash stripped, truncated) + status +
 *   timing are recorded — never request/response bodies or headers, which could hold tokens/PII.
 * - **Memory-only.** Nothing is persisted or transmitted by capture itself; entries are only sent
 *   inside a report the user explicitly submits (merged into `console_logs`, level `"network"`).
 * - Originals are restored on `uninstall()` (component unmount).
 */
import type { ConsoleLogEntry } from "./consoleCapture";

/** One captured network failure. `status` is the HTTP status, or `"failed"` when the request threw. */
export interface NetworkLogEntry {
  method: string;
  /** Sanitized URL: query string + hash stripped, truncated to 200 chars. */
  url: string;
  status: number | "failed";
  duration_ms: number;
  /** When the request STARTED (epoch ms). */
  ts_ms: number;
}

/** Handle returned by {@link installNetworkCapture}; same shape as the console-capture handle. */
export interface NetworkCaptureHandle {
  /** Current buffer contents, oldest first. */
  getEntries(): NetworkLogEntry[];
  /** Empty the buffer (does not stop capturing new entries). */
  clear(): void;
  /** Register a listener invoked after every buffer mutation. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** Restore the original fetch/XHR and stop capturing. Idempotent. */
  uninstall(): void;
}

const MAX_URL_LENGTH = 200;

/**
 * Strip the query string + hash (they routinely carry tokens/PII) and truncate. Never throws —
 * a URL we cannot parse is sanitized textually.
 */
export function sanitizeNetworkUrl(raw: string): string {
  let out: string;
  try {
    const base = typeof window !== "undefined" ? window.location.href : undefined;
    const parsed = new URL(raw, base);
    out = `${parsed.origin}${parsed.pathname}`;
  } catch {
    out = raw.split(/[?#]/, 1)[0] ?? raw;
  }
  return out.length > MAX_URL_LENGTH ? `${out.slice(0, MAX_URL_LENGTH)}…` : out;
}

/**
 * Render a network entry as a `console_logs`-compatible entry (level `"network"`), so network
 * errors ride the EXISTING report field + GitHub-issue log block with no backend change.
 */
export function formatNetworkEntry(entry: NetworkLogEntry): ConsoleLogEntry {
  return {
    level: "network",
    ts_ms: entry.ts_ms,
    text: `${entry.method} ${entry.url} → ${entry.status} (${entry.duration_ms}ms)`,
  };
}

/** Per-XHR request metadata stashed at `open()` time, consumed at `send()`/loadend. */
interface XhrMeta {
  method: string;
  url: string;
  startedAt: number;
}

/**
 * Install the fetch + XHR wrap. Pair every install with an `uninstall()` (the component does this
 * mount/unmount). Multiple concurrent installs each layer their own wrap and restore what they saw.
 *
 * @param maxEntries Ring-buffer capacity (default 100).
 */
export function installNetworkCapture(maxEntries = 100): NetworkCaptureHandle {
  const entries: NetworkLogEntry[] = [];
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of listeners) listener();
  };

  /** Record one entry. Everything is inside try/catch: recording must never break a request. */
  const record = (method: string, url: string, status: number | "failed", startedAt: number) => {
    try {
      const now = Date.now();
      entries.push({
        method,
        url: sanitizeNetworkUrl(url),
        status,
        duration_ms: Math.max(0, now - startedAt),
        ts_ms: startedAt,
      });
      if (entries.length > maxEntries) {
        entries.splice(0, entries.length - maxEntries);
      }
      notify();
    } catch {
      // Fail-silent by contract.
    }
  };

  // ---- fetch wrap -------------------------------------------------------------------------
  const originalFetch = typeof window.fetch === "function" ? window.fetch : null;
  if (originalFetch) {
    const wrappedFetch = function (
      this: unknown,
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> {
      let method = "GET";
      let url = "";
      let startedAt = 0;
      try {
        startedAt = Date.now();
        if (typeof input === "string") url = input;
        else if (input instanceof URL) url = input.href;
        else if (input && typeof input === "object") {
          url = input.url;
          method = input.method || "GET";
        }
        if (init?.method) method = init.method;
        method = method.toUpperCase();
      } catch {
        // Fail-silent: still forward the request below.
      }
      return originalFetch.call(this ?? window, input as RequestInfo, init).then(
        (response) => {
          if (response && typeof response.status === "number" && response.status >= 400) {
            record(method, url, response.status, startedAt);
          }
          return response; // identity passthrough — the caller gets the original object
        },
        (reason: unknown) => {
          record(method, url, "failed", startedAt);
          throw reason; // rethrow the original reason untouched
        },
      );
    };
    window.fetch = wrappedFetch as typeof window.fetch;
  }

  // ---- XMLHttpRequest wrap ----------------------------------------------------------------
  const XhrCtor = typeof window.XMLHttpRequest === "function" ? window.XMLHttpRequest : null;
  const originalOpen = XhrCtor?.prototype.open ?? null;
  const originalSend = XhrCtor?.prototype.send ?? null;
  const xhrMeta = new WeakMap<object, XhrMeta>();

  if (XhrCtor && originalOpen && originalSend) {
    XhrCtor.prototype.open = function (
      this: XMLHttpRequest,
      method: string,
      url: string | URL,
      ...rest: unknown[]
    ) {
      try {
        xhrMeta.set(this, {
          method: String(method).toUpperCase(),
          url: typeof url === "string" ? url : url.href,
          startedAt: 0,
        });
      } catch {
        // Fail-silent.
      }
      return (originalOpen as (...args: unknown[]) => void).apply(this, [method, url, ...rest]);
    } as typeof XhrCtor.prototype.open;

    XhrCtor.prototype.send = function (this: XMLHttpRequest, ...args: unknown[]) {
      try {
        const meta = xhrMeta.get(this);
        if (meta) {
          meta.startedAt = Date.now();
          this.addEventListener("loadend", () => {
            try {
              // status 0 at loadend = network failure / CORS / abort; >=400 = HTTP error.
              if (this.status === 0) record(meta.method, meta.url, "failed", meta.startedAt);
              else if (this.status >= 400) record(meta.method, meta.url, this.status, meta.startedAt);
            } catch {
              // Fail-silent.
            }
          });
        }
      } catch {
        // Fail-silent.
      }
      return (originalSend as (...args: unknown[]) => void).apply(this, args);
    } as typeof XhrCtor.prototype.send;
  }

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
      if (originalFetch) window.fetch = originalFetch;
      if (XhrCtor && originalOpen && originalSend) {
        XhrCtor.prototype.open = originalOpen;
        XhrCtor.prototype.send = originalSend;
      }
      listeners.clear();
    },
  };
}
