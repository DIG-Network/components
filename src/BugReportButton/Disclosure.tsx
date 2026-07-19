/**
 * Elegant collapsible section used for the diagnostics previews (console + network errors).
 * A real `<button>` with `aria-expanded`/`aria-controls` driving an always-mounted region
 * (hidden via the `hidden` attribute when collapsed) — the accessible disclosure pattern from
 * the ARIA Authoring Practices, replacing the old raw `<details>` whose `<summary>` failed the
 * WCAG 2.2 target-size check.
 */
import type { JSX, ReactNode } from "react";
import { ChevronIcon } from "./icons";

export interface DisclosureProps {
  /** Visible section label, e.g. "Console errors". */
  label: string;
  /** Entry count rendered in the badge next to the label. */
  count: number;
  expanded: boolean;
  onToggle: () => void;
  /** Unique DOM id for the content region (wired to the toggle's `aria-controls`). */
  regionId: string;
  /** Stable test id for the section container. */
  containerTestId: string;
  /** Stable test id for the toggle button. */
  toggleTestId: string;
  children: ReactNode;
}

export function Disclosure(props: DisclosureProps): JSX.Element {
  const { label, count, expanded, onToggle, regionId, containerTestId, toggleTestId, children } = props;
  return (
    <section className="digbr-disclosure" data-testid={containerTestId} aria-label={label}>
      <button
        type="button"
        className="digbr-disclosure-toggle"
        aria-expanded={expanded}
        aria-controls={regionId}
        data-testid={toggleTestId}
        onClick={onToggle}
      >
        <span>{label}</span>
        <span className={`digbr-count${count > 0 ? " digbr-count-hot" : ""}`}>{count}</span>
        <span className={`digbr-chevron${expanded ? " digbr-chevron-open" : ""}`}>
          <ChevronIcon />
        </span>
      </button>
      <div id={regionId} className="digbr-disclosure-body" hidden={!expanded}>
        {children}
      </div>
    </section>
  );
}
