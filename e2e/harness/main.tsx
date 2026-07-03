import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BugReportButton } from "../../src";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BugReportButton repo="hub.dig.net" apiBase="https://api.bugreport.test" />
  </StrictMode>,
);

// Simulate host-app failures AFTER the widget mounts, so the diagnostics disclosures have
// real content in the e2e run (badge counts, list rendering, axe on populated sections).
setTimeout(() => {
  // eslint-disable-next-line no-console -- intentional demo error for the capture buffers
  console.error("Demo: failed to hydrate capsule list (example console error)");
  void fetch("/__nonexistent-endpoint?with=query").catch(() => undefined);
}, 250);
