import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  installNetworkCapture,
  formatNetworkEntry,
  sanitizeNetworkUrl,
} from "../src/BugReportButton/networkCapture";
import type { NetworkCaptureHandle } from "../src/BugReportButton/networkCapture";

/** Minimal fake XHR the capture layer can patch (jsdom's real XHR can't fake statuses easily). */
class FakeXhr {
  static instances: FakeXhr[] = [];
  status = 0;
  private listeners = new Map<string, Array<() => void>>();
  openArgs: unknown[] = [];
  sendCalled = false;

  open(...args: unknown[]) {
    this.openArgs = args;
  }
  send() {
    this.sendCalled = true;
    FakeXhr.instances.push(this);
  }
  addEventListener(type: string, listener: () => void) {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }
  emit(type: string) {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
}

describe("installNetworkCapture — fetch", () => {
  let originalFetch: typeof window.fetch;
  let handle: NetworkCaptureHandle | null = null;

  beforeEach(() => {
    originalFetch = window.fetch;
  });

  afterEach(() => {
    handle?.uninstall();
    handle = null;
    window.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("records a fetch whose response status is >= 400", async () => {
    const response = new Response("nope", { status: 502 });
    window.fetch = vi.fn().mockResolvedValue(response);
    handle = installNetworkCapture();

    await window.fetch("https://api.example.test/things?token=SECRET");

    const entries = handle.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.method).toBe("GET");
    expect(entries[0]!.status).toBe(502);
    expect(entries[0]!.url).toBe("https://api.example.test/things");
    expect(entries[0]!.url).not.toContain("SECRET");
    expect(typeof entries[0]!.duration_ms).toBe("number");
    expect(typeof entries[0]!.ts_ms).toBe("number");
  });

  it("does NOT record a 2xx response", async () => {
    window.fetch = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    handle = installNetworkCapture();

    await window.fetch("https://api.example.test/ok");
    expect(handle.getEntries()).toHaveLength(0);
  });

  it("returns the exact same Response object the original fetch produced (pure passthrough)", async () => {
    const response = new Response("payload", { status: 503 });
    window.fetch = vi.fn().mockResolvedValue(response);
    handle = installNetworkCapture();

    const result = await window.fetch("https://api.example.test/x");
    expect(result).toBe(response);
    expect(await result.text()).toBe("payload");
  });

  it("records a thrown fetch (network failure) as status 'failed' and rethrows the same reason", async () => {
    const reason = new TypeError("Failed to fetch");
    window.fetch = vi.fn().mockRejectedValue(reason);
    handle = installNetworkCapture();

    await expect(window.fetch("https://api.example.test/down", { method: "post" })).rejects.toBe(
      reason,
    );
    const entries = handle.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.status).toBe("failed");
    expect(entries[0]!.method).toBe("POST");
  });

  it("reads method + url from a Request object input", async () => {
    window.fetch = vi.fn().mockResolvedValue(new Response("no", { status: 404 }));
    handle = installNetworkCapture();

    await window.fetch(new Request("https://api.example.test/req?q=1", { method: "DELETE" }));
    const entries = handle.getEntries();
    expect(entries[0]!.method).toBe("DELETE");
    expect(entries[0]!.url).toBe("https://api.example.test/req");
  });

  it("evicts oldest entries beyond the buffer cap (FIFO)", async () => {
    window.fetch = vi.fn().mockResolvedValue(new Response("no", { status: 500 }));
    handle = installNetworkCapture(2);

    await window.fetch("https://api.example.test/1");
    await window.fetch("https://api.example.test/2");
    await window.fetch("https://api.example.test/3");

    const entries = handle.getEntries();
    expect(entries).toHaveLength(2);
    expect(entries[0]!.url).toContain("/2");
    expect(entries[1]!.url).toContain("/3");
  });

  it("clear() empties the buffer and notifies subscribers", async () => {
    window.fetch = vi.fn().mockResolvedValue(new Response("no", { status: 500 }));
    handle = installNetworkCapture();
    const listener = vi.fn();
    handle.subscribe(listener);

    await window.fetch("https://api.example.test/err");
    expect(listener).toHaveBeenCalled();

    handle.clear();
    expect(handle.getEntries()).toHaveLength(0);
  });

  it("uninstall() restores the original window.fetch", () => {
    const fake = vi.fn();
    window.fetch = fake as unknown as typeof window.fetch;
    handle = installNetworkCapture();
    expect(window.fetch).not.toBe(fake);

    handle.uninstall();
    handle = null;
    expect(window.fetch).toBe(fake);
  });

  it("stays fail-silent: a recording bug never breaks the passed-through request", async () => {
    const response = new Response("ok-but-weird", { status: 500 });
    // Poison Date.now during recording — capture must swallow it, not break fetch.
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => {
      throw new Error("clock broke");
    });
    window.fetch = vi.fn().mockResolvedValue(response);
    handle = installNetworkCapture();

    const result = await window.fetch("https://api.example.test/weird");
    nowSpy.mockRestore();
    expect(result).toBe(response);
  });
});

describe("installNetworkCapture — XMLHttpRequest", () => {
  let originalXhr: typeof XMLHttpRequest;
  let handle: NetworkCaptureHandle | null = null;

  beforeEach(() => {
    originalXhr = window.XMLHttpRequest;
    FakeXhr.instances = [];
    window.XMLHttpRequest = FakeXhr as unknown as typeof XMLHttpRequest;
  });

  afterEach(() => {
    handle?.uninstall();
    handle = null;
    window.XMLHttpRequest = originalXhr;
  });

  it("records an XHR whose final status is >= 400", () => {
    handle = installNetworkCapture();
    const xhr = new window.XMLHttpRequest() as unknown as FakeXhr;
    xhr.open("PUT", "https://api.example.test/xhr?secret=1");
    xhr.send();
    xhr.status = 404;
    xhr.emit("loadend");

    const entries = handle.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.method).toBe("PUT");
    expect(entries[0]!.status).toBe(404);
    expect(entries[0]!.url).toBe("https://api.example.test/xhr");
  });

  it("records a failed XHR (status 0 at loadend) as 'failed'", () => {
    handle = installNetworkCapture();
    const xhr = new window.XMLHttpRequest() as unknown as FakeXhr;
    xhr.open("GET", "https://api.example.test/dead");
    xhr.send();
    xhr.status = 0;
    xhr.emit("loadend");

    expect(handle.getEntries()[0]!.status).toBe("failed");
  });

  it("does not record a successful XHR", () => {
    handle = installNetworkCapture();
    const xhr = new window.XMLHttpRequest() as unknown as FakeXhr;
    xhr.open("GET", "https://api.example.test/fine");
    xhr.send();
    xhr.status = 204;
    xhr.emit("loadend");

    expect(handle.getEntries()).toHaveLength(0);
  });

  it("uninstall() restores the original XHR prototype methods", () => {
    const openBefore = window.XMLHttpRequest.prototype.open;
    const sendBefore = window.XMLHttpRequest.prototype.send;
    handle = installNetworkCapture();
    expect(window.XMLHttpRequest.prototype.open).not.toBe(openBefore);

    handle.uninstall();
    handle = null;
    expect(window.XMLHttpRequest.prototype.open).toBe(openBefore);
    expect(window.XMLHttpRequest.prototype.send).toBe(sendBefore);
  });
});

describe("sanitizeNetworkUrl", () => {
  it("strips the query string and hash (may hold tokens/PII)", () => {
    expect(sanitizeNetworkUrl("https://a.test/p?token=x#frag")).toBe("https://a.test/p");
  });

  it("truncates very long URLs", () => {
    const long = `https://a.test/${"x".repeat(500)}`;
    const out = sanitizeNetworkUrl(long);
    expect(out.length).toBeLessThanOrEqual(201);
    expect(out.endsWith("…")).toBe(true);
  });

  it("tolerates relative URLs", () => {
    expect(sanitizeNetworkUrl("/api/v1/thing?x=1")).toContain("/api/v1/thing");
  });
});

describe("formatNetworkEntry", () => {
  it("renders a status entry as a console_logs-compatible entry with level 'network'", () => {
    const entry = formatNetworkEntry({
      method: "GET",
      url: "https://api.example.test/things",
      status: 502,
      duration_ms: 1240,
      ts_ms: 1700000000000,
    });
    expect(entry.level).toBe("network");
    expect(entry.ts_ms).toBe(1700000000000);
    expect(entry.text).toBe("GET https://api.example.test/things → 502 (1240ms)");
  });

  it("renders a failed entry", () => {
    const entry = formatNetworkEntry({
      method: "POST",
      url: "https://api.example.test/x",
      status: "failed",
      duration_ms: 32,
      ts_ms: 1,
    });
    expect(entry.text).toBe("POST https://api.example.test/x → failed (32ms)");
  });
});

describe("installNetworkCapture — edge branches", () => {
  let originalFetch: typeof window.fetch;
  let handle: NetworkCaptureHandle | null = null;

  beforeEach(() => {
    originalFetch = window.fetch;
  });

  afterEach(() => {
    handle?.uninstall();
    handle = null;
    window.fetch = originalFetch;
  });

  it("reads the URL from a URL-object fetch input", async () => {
    window.fetch = vi.fn().mockResolvedValue(new Response("no", { status: 500 }));
    handle = installNetworkCapture();

    await window.fetch(new URL("https://api.example.test/from-url-object?x=1"));
    expect(handle.getEntries()[0]!.url).toBe("https://api.example.test/from-url-object");
  });

  it("init.method overrides the Request object's method", async () => {
    window.fetch = vi.fn().mockResolvedValue(new Response("no", { status: 500 }));
    handle = installNetworkCapture();

    await window.fetch(new Request("https://api.example.test/x", { method: "GET" }), {
      method: "patch",
    });
    expect(handle.getEntries()[0]!.method).toBe("PATCH");
  });

  it("installs and uninstalls cleanly when window.fetch is absent (XHR-only environment)", () => {
    // @ts-expect-error simulating an environment without fetch
    window.fetch = undefined;
    handle = installNetworkCapture();
    expect(window.fetch).toBeUndefined();
    handle.uninstall();
    handle = null;
  });

  it("accepts a URL object in XHR open()", () => {
    const RealXhr = window.XMLHttpRequest;
    class UrlFakeXhr {
      status = 0;
      private listeners: Array<() => void> = [];
      open(_m: string, _u: URL) {}
      send() {}
      addEventListener(_t: string, l: () => void) {
        this.listeners.push(l);
      }
      emit() {
        for (const l of this.listeners) l();
      }
    }
    window.XMLHttpRequest = UrlFakeXhr as unknown as typeof XMLHttpRequest;
    try {
      handle = installNetworkCapture();
      const xhr = new window.XMLHttpRequest() as unknown as UrlFakeXhr;
      xhr.open("GET", new URL("https://api.example.test/xhr-url-object?q=2"));
      xhr.send();
      xhr.status = 500;
      xhr.emit();
      expect(handle.getEntries()[0]!.url).toBe("https://api.example.test/xhr-url-object");
    } finally {
      handle?.uninstall();
      handle = null;
      window.XMLHttpRequest = RealXhr;
    }
  });
});

describe("sanitizeNetworkUrl — edge branches", () => {
  it("falls back to textual query-stripping for unparseable URLs", () => {
    expect(sanitizeNetworkUrl("https://")).toBe("https://");
    expect(sanitizeNetworkUrl("http://?q=1")).toBe("http://");
  });
});
