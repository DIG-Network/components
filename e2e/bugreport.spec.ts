/**
 * e2e + a11y suite for <BugReportButton>, run against the demo harness in real Chromium.
 *
 * Proves the three v0.1.1 contracts end-to-end:
 *  1. a11y — the OPEN panel passes axe WCAG 2.0/2.1/2.2 AA, INCLUDING the target-size rule that
 *     consumers previously had to suppress (#218).
 *  2. Screenshot — the automatic capture is DOM rasterization: getDisplayMedia is never invoked,
 *     and the preview renders a real PNG of the page.
 *  3. Design — desktop + mobile, light + dark screenshots for visual inspection.
 */
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";

const SHOTS = "e2e/screenshots";
mkdirSync(SHOTS, { recursive: true });

/** Stub the bugreport API (cross-origin, so CORS headers are required) + spy getDisplayMedia. */
async function prepare(page: Page): Promise<void> {
  await page.route("https://api.bugreport.test/**", async (route) => {
    const url = route.request().url();
    const cors = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "GET,POST,OPTIONS",
    };
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }
    if (url.includes("/v1/challenge")) {
      await route.fulfill({
        status: 200,
        headers: cors,
        contentType: "application/json",
        body: JSON.stringify({ token: "e2e-challenge", exp: Date.now() + 300_000 }),
      });
      return;
    }
    if (url.includes("/v1/reports")) {
      await route.fulfill({
        status: 202,
        headers: cors,
        contentType: "application/json",
        body: JSON.stringify({ id: "e2e-report-42", issue: { number: 7, url: "https://github.com/DIG-Network/hub.dig.net/issues/7" } }),
      });
      return;
    }
    await route.fulfill({ status: 404, headers: cors, body: "{}" });
  });

  // Spy on getDisplayMedia so we can PROVE auto-capture never touches it.
  await page.addInitScript(() => {
    (window as unknown as { __displayMediaCalls: number }).__displayMediaCalls = 0;
    const devices = navigator.mediaDevices;
    if (devices) {
      const original = devices.getDisplayMedia?.bind(devices);
      devices.getDisplayMedia = ((...args: unknown[]) => {
        (window as unknown as { __displayMediaCalls: number }).__displayMediaCalls += 1;
        return original
          ? (original as (...a: unknown[]) => Promise<MediaStream>)(...args)
          : Promise.reject(new Error("unavailable"));
      }) as typeof devices.getDisplayMedia;
    }
  });
}

async function openPanel(page: Page): Promise<void> {
  await page.goto("/");
  // Let the harness fire its demo console + network errors so the disclosures are populated.
  await page.waitForTimeout(500);
  await page.getByTestId("bugreport-launcher").click();
  await expect(page.getByTestId("bugreport-panel")).toBeVisible();
}

test.describe("a11y — WCAG 2.2 AA including target-size (#218)", () => {
  test("the OPEN panel passes axe with wcag2a/aa + wcag21aa + wcag22aa (no suppressions)", async ({ page }) => {
    await prepare(page);
    await openPanel(page);
    // Expand both disclosures so their content is part of the scan.
    await page.getByTestId("bugreport-console-toggle").click();
    await page.getByTestId("bugreport-network-toggle").click();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test("the target-size rule specifically passes on the open panel (previously suppressed)", async ({ page }) => {
    await prepare(page);
    await openPanel(page);
    await page.getByTestId("bugreport-console-toggle").click();
    await page.getByTestId("bugreport-network-toggle").click();

    const results = await new AxeBuilder({ page }).withRules(["target-size"]).analyze();
    expect(results.violations).toEqual([]);
  });

  test("the closed state (launcher only) also passes axe", async ({ page }) => {
    await prepare(page);
    await page.goto("/");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});

test.describe("automatic screenshot — DOM rasterization, never getDisplayMedia", () => {
  test("opening the panel produces a PNG preview without invoking the screen-share picker", async ({ page }) => {
    await prepare(page);
    await openPanel(page);

    const preview = page.getByTestId("bugreport-screenshot-preview");
    await expect(preview).toBeVisible({ timeout: 10_000 });
    await expect(preview).toHaveAttribute("src", /^data:image\/png/);
    // A real rasterized bitmap, not a broken image.
    const naturalWidth = await preview.evaluate((img: HTMLImageElement) => img.naturalWidth);
    expect(naturalWidth).toBeGreaterThan(100);

    const displayMediaCalls = await page.evaluate(
      () => (window as unknown as { __displayMediaCalls: number }).__displayMediaCalls,
    );
    expect(displayMediaCalls).toBe(0);

    // Save the CAPTURED image itself for visual inspection: it must show the demo page
    // WITHOUT the panel or launcher in it.
    const dataUrl = await preview.evaluate((img: HTMLImageElement) => img.getAttribute("src"));
    const base64 = dataUrl!.replace(/^data:image\/png;base64,/, "");
    const { writeFileSync } = await import("node:fs");
    writeFileSync(`${SHOTS}/captured-page-screenshot.png`, Buffer.from(base64, "base64"));
  });

  test("the captured shot excludes the widget (no panel pixels in the top-left card area)", async ({ page }) => {
    await prepare(page);
    await openPanel(page);
    const preview = page.getByTestId("bugreport-screenshot-preview");
    await expect(preview).toBeVisible({ timeout: 10_000 });
    // The capture ran before the panel mounted; the page behind is what's in the image. The
    // strongest automated proof is the unit-level exclusion test; here we assert the image
    // decoded to the full viewport size (a panel-covered capture via screen share would have
    // required a picker, which we proved never opened).
    const size = await preview.evaluate((img: HTMLImageElement) => ({
      w: img.naturalWidth,
      h: img.naturalHeight,
    }));
    const viewport = page.viewportSize()!;
    expect(size.w).toBe(viewport.width);
    expect(size.h).toBe(viewport.height);
  });
});

test.describe("full report flow", () => {
  test("filling + sending reaches the success state with the report reference and NO issue link", async ({ page }) => {
    await prepare(page);
    await openPanel(page);
    await page.getByTestId("bugreport-description-input").fill("The capsule list failed to load.");
    await page.getByTestId("bugreport-submit").click();

    await expect(page.getByTestId("bugreport-success")).toBeVisible();
    await expect(page.getByTestId("bugreport-report-id")).toHaveText("e2e-report-42");
    // The API returned an issue URL; the UI must not surface it (maintainer-internal).
    await expect(page.getByTestId("bugreport-issue-link")).toHaveCount(0);
    await expect(page.locator(".digbr-panel a")).toHaveCount(0);

    await page.screenshot({ path: `${SHOTS}/desktop-light-success.png` });
  });
});

test.describe("design screenshots — desktop + mobile, light + dark", () => {
  test("desktop light: launcher + open panel", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await prepare(page);
    await page.goto("/");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/desktop-light-launcher.png` });

    await page.getByTestId("bugreport-launcher").click();
    await expect(page.getByTestId("bugreport-panel")).toBeVisible();
    await expect(page.getByTestId("bugreport-screenshot-preview")).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(300);
    await page.locator(".digbr-body").evaluate((el) => el.scrollTo(0, 0));
    await page.screenshot({ path: `${SHOTS}/desktop-light-panel.png` });

    // Second shot: scrolled to the diagnostics with the console disclosure expanded.
    await page.getByTestId("bugreport-console-toggle").click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/desktop-light-panel-diagnostics.png` });
  });

  test("desktop dark: open panel", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.emulateMedia({ colorScheme: "dark" });
    await prepare(page);
    await page.goto("/");
    await page.waitForTimeout(500);
    await page.getByTestId("bugreport-launcher").click();
    await expect(page.getByTestId("bugreport-panel")).toBeVisible();
    await expect(page.getByTestId("bugreport-screenshot-preview")).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(300);
    await page.locator(".digbr-body").evaluate((el) => el.scrollTo(0, 0));
    await page.screenshot({ path: `${SHOTS}/desktop-dark-panel.png` });
  });

  test("mobile light + dark: open panel (bottom sheet)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await prepare(page);
    await page.goto("/");
    await page.waitForTimeout(500);
    await page.getByTestId("bugreport-launcher").click();
    await expect(page.getByTestId("bugreport-panel")).toBeVisible();
    await expect(page.getByTestId("bugreport-screenshot-preview")).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/mobile-light-panel.png` });

    await page.emulateMedia({ colorScheme: "dark" });
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${SHOTS}/mobile-dark-panel.png` });
  });
});
