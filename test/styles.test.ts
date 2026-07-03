import { describe, it, expect, afterEach } from "vitest";
import { acquireStylesheet, buildStylesheet, STYLE_ELEMENT_ID } from "../src/BugReportButton/styles";

afterEach(() => {
  document.getElementById(STYLE_ELEMENT_ID)?.remove();
});

describe("buildStylesheet", () => {
  const css = buildStylesheet();

  it("scopes every rule under the digbr- prefix (no bare element/global selectors)", () => {
    // Every selector line must start with .digbr-, an at-rule, a nested selector, or a comment.
    const selectorLines = css
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.endsWith("{") && !line.startsWith("@") && !line.startsWith("/*"));
    for (const line of selectorLines) {
      // Each comma-separated selector in the line must be rooted at a .digbr- class.
      for (const selector of line.slice(0, -1).split(",")) {
        expect(selector.trim(), `unscoped selector: ${selector}`).toMatch(/^\.digbr-|^from$|^to$/);
      }
    }
  });

  it("ships dark-mode, reduced-motion, and mobile variants", () => {
    expect(css).toContain("@media (prefers-color-scheme: dark)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("@media (max-width: 520px)");
  });

  it("meets the WCAG 2.5.8 target-size floor in the declared control sizes", () => {
    // The two controls flagged by #218 — the file-input target and the disclosure toggle —
    // plus the primary action all declare explicit >=24px (44px primary) hit sizes.
    expect(css).toMatch(/\.digbr-disclosure-toggle[^}]*min-height: 40px/s);
    expect(css).toMatch(/\.digbr-btn-primary[^}]*min-height: 44px/s);
    expect(css).toMatch(/\.digbr-launcher[^}]*width: 56px/s);
  });

  it("references no external resources (CSP self-contained)", () => {
    expect(css).not.toMatch(/url\(\s*['"]?https?:/i);
    expect(css).not.toContain("@import");
    expect(css).not.toContain("@font-face");
  });
});

describe("acquireStylesheet", () => {
  it("injects once, shares across acquirers, and removes after the last release", () => {
    const release1 = acquireStylesheet();
    expect(document.getElementById(STYLE_ELEMENT_ID)).not.toBeNull();
    expect(document.querySelectorAll(`#${STYLE_ELEMENT_ID}`)).toHaveLength(1);

    const release2 = acquireStylesheet();
    expect(document.querySelectorAll(`#${STYLE_ELEMENT_ID}`)).toHaveLength(1);

    release1();
    expect(document.getElementById(STYLE_ELEMENT_ID)).not.toBeNull();

    release2();
    expect(document.getElementById(STYLE_ELEMENT_ID)).toBeNull();
  });

  it("release is idempotent (double-release cannot strand the counter)", () => {
    const release = acquireStylesheet();
    release();
    release();
    const releaseAgain = acquireStylesheet();
    expect(document.getElementById(STYLE_ELEMENT_ID)).not.toBeNull();
    releaseAgain();
    expect(document.getElementById(STYLE_ELEMENT_ID)).toBeNull();
  });
});
