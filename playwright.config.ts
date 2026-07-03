import { defineConfig } from "@playwright/test";

// e2e + a11y suite for @dignetwork/components. Serves the demo harness (e2e/harness) with vite
// and drives the REAL component in Chromium: axe (WCAG 2.x incl. 2.2 target-size) on the open
// panel, the DOM-rasterization screenshot path, and the design screenshots (desktop + mobile,
// light + dark) that gate visual review.
export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"]] : [["list"]],
  use: {
    baseURL: "http://localhost:5199",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npx vite e2e/harness --port 5199 --strictPort",
    url: "http://localhost:5199",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
