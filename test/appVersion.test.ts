import { describe, it, expect, afterEach } from "vitest";
import { resolveAppVersion } from "../src/BugReportButton/appVersion";

declare global {
  interface Window {
    __APP_VERSION__?: unknown;
  }
}

afterEach(() => {
  document.head.querySelectorAll('meta[name="app-version"]').forEach((el) => el.remove());
  delete window.__APP_VERSION__;
});

function addMeta(content: string) {
  const meta = document.createElement("meta");
  meta.setAttribute("name", "app-version");
  meta.setAttribute("content", content);
  document.head.appendChild(meta);
}

describe("resolveAppVersion", () => {
  it("returns the explicit value when provided (highest precedence)", () => {
    addMeta("2.0.0");
    window.__APP_VERSION__ = "3.0.0";
    expect(resolveAppVersion("1.2.3")).toBe("1.2.3");
  });

  it('falls back to <meta name="app-version"> when no explicit value is given', () => {
    addMeta("2.4.6");
    window.__APP_VERSION__ = "3.0.0";
    expect(resolveAppVersion()).toBe("2.4.6");
  });

  it("falls back to window.__APP_VERSION__ when neither prop nor meta exist", () => {
    window.__APP_VERSION__ = "3.1.4";
    expect(resolveAppVersion()).toBe("3.1.4");
  });

  it("returns undefined when no source provides a version", () => {
    expect(resolveAppVersion()).toBeUndefined();
  });

  it("ignores empty/whitespace-only values at every tier", () => {
    addMeta("   ");
    window.__APP_VERSION__ = "";
    expect(resolveAppVersion("  ")).toBeUndefined();
  });

  it("ignores a non-string window.__APP_VERSION__", () => {
    window.__APP_VERSION__ = 42;
    expect(resolveAppVersion()).toBeUndefined();
  });

  it("trims the resolved value", () => {
    addMeta("  5.0.1  ");
    expect(resolveAppVersion()).toBe("5.0.1");
  });
});
