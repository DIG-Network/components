import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { installConsoleCapture } from "../src/BugReportButton/consoleCapture";

describe("installConsoleCapture", () => {
  let originalLog: typeof console.log;
  let originalError: typeof console.error;
  let originalWarn: typeof console.warn;
  let originalInfo: typeof console.info;
  let originalDebug: typeof console.debug;

  beforeEach(() => {
    originalLog = console.log;
    originalError = console.error;
    originalWarn = console.warn;
    originalInfo = console.info;
    originalDebug = console.debug;
  });

  afterEach(() => {
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
    console.info = originalInfo;
    console.debug = originalDebug;
  });

  it("captures console.log/info/warn/error/debug with level + text + timestamp", () => {
    const handle = installConsoleCapture();
    console.log("hello", 42);
    console.info("info entry");
    console.warn("warn entry");
    console.error("error entry");
    console.debug("debug entry");

    const entries = handle.getEntries();
    expect(entries).toHaveLength(5);
    expect(entries[0]).toMatchObject({ level: "log", text: "hello 42" });
    expect(entries[1]).toMatchObject({ level: "info", text: "info entry" });
    expect(entries[2]).toMatchObject({ level: "warn", text: "warn entry" });
    expect(entries[3]).toMatchObject({ level: "error", text: "error entry" });
    expect(entries[4]).toMatchObject({ level: "debug", text: "debug entry" });
    for (const e of entries) {
      expect(typeof e.ts_ms).toBe("number");
      expect(e.ts_ms).toBeGreaterThan(0);
    }
    handle.uninstall();
  });

  it("still calls through to the original console method", () => {
    const spy = vi.fn();
    console.log = spy;
    const handle = installConsoleCapture();
    console.log("passthrough");
    expect(spy).toHaveBeenCalledWith("passthrough");
    handle.uninstall();
  });

  it("captures window 'error' events as error-level entries", () => {
    const handle = installConsoleCapture();
    const event = new ErrorEvent("error", {
      message: "boom",
      filename: "app.js",
      lineno: 10,
      colno: 5,
    });
    window.dispatchEvent(event);

    const entries = handle.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.level).toBe("error");
    expect(entries[0]?.text).toContain("boom");
    handle.uninstall();
  });

  it("captures unhandledrejection events as error-level entries", () => {
    const handle = installConsoleCapture();
    const promise = Promise.reject(new Error("nope"));
    // Prevent the unhandled rejection from failing the test run itself.
    promise.catch(() => undefined);
    const event = new PromiseRejectionEvent("unhandledrejection", {
      promise,
      reason: new Error("nope"),
    });
    window.dispatchEvent(event);

    const entries = handle.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.level).toBe("error");
    expect(entries[0]?.text).toContain("nope");
    handle.uninstall();
  });

  it("caps the ring buffer at maxEntries, dropping the oldest first", () => {
    const handle = installConsoleCapture(300);
    for (let i = 0; i < 305; i++) {
      console.log(`entry-${i}`);
    }
    const entries = handle.getEntries();
    expect(entries).toHaveLength(300);
    expect(entries[0]?.text).toBe("entry-5");
    expect(entries[299]?.text).toBe("entry-304");
    handle.uninstall();
  });

  it("respects a custom maxEntries", () => {
    const handle = installConsoleCapture(3);
    console.log("a");
    console.log("b");
    console.log("c");
    console.log("d");
    const entries = handle.getEntries();
    expect(entries.map((e) => e.text)).toEqual(["b", "c", "d"]);
    handle.uninstall();
  });

  it("uninstall() restores the original console methods and stops capturing", () => {
    const originalRef = console.log;
    const handle = installConsoleCapture();
    expect(console.log).not.toBe(originalRef);
    handle.uninstall();
    expect(console.log).toBe(originalRef);

    console.log("after uninstall");
    expect(handle.getEntries()).toHaveLength(0);
  });

  it("clear() empties the buffer and notifies subscribers", () => {
    const handle = installConsoleCapture();
    console.log("one");
    expect(handle.getEntries()).toHaveLength(1);

    const listener = vi.fn();
    const unsubscribe = handle.subscribe(listener);
    handle.clear();
    expect(handle.getEntries()).toHaveLength(0);
    expect(listener).toHaveBeenCalled();
    unsubscribe();
    handle.uninstall();
  });

  it("subscribe() notifies on new entries; unsubscribe() stops notifications", () => {
    const handle = installConsoleCapture();
    const listener = vi.fn();
    const unsubscribe = handle.subscribe(listener);

    console.log("first");
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    console.log("second");
    expect(listener).toHaveBeenCalledTimes(1);

    handle.uninstall();
  });

  it("serializes non-string arguments and error objects safely", () => {
    const handle = installConsoleCapture();
    console.log({ a: 1 });
    console.error(new Error("bad thing"));
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    console.warn(circular);

    const entries = handle.getEntries();
    expect(entries[0]?.text).toContain('"a":1');
    expect(entries[1]?.text).toContain("bad thing");
    expect(entries[2]?.text).toBe(String(circular));
    handle.uninstall();
  });
});
