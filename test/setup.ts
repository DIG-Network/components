import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Ensure every test starts from a clean DOM (React Testing Library unmounts + removes nodes).
afterEach(() => {
  cleanup();
});

// jsdom does not implement PromiseRejectionEvent (used to test unhandledrejection capture) —
// polyfill a minimal version so tests can dispatch it against `window`.
if (typeof (globalThis as { PromiseRejectionEvent?: unknown }).PromiseRejectionEvent === "undefined") {
  class PromiseRejectionEventPolyfill extends Event {
    promise: Promise<unknown>;
    reason: unknown;
    constructor(type: string, init: { promise: Promise<unknown>; reason: unknown }) {
      super(type);
      this.promise = init.promise;
      this.reason = init.reason;
    }
  }
  (globalThis as { PromiseRejectionEvent?: unknown }).PromiseRejectionEvent =
    PromiseRejectionEventPolyfill;
}
