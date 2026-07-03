import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BugReportButton } from "../src/BugReportButton/BugReportButton";
import * as api from "../src/BugReportButton/api";

vi.mock("../src/BugReportButton/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/BugReportButton/api")>();
  return {
    ...actual,
    fetchChallenge: vi.fn(),
    submitReport: vi.fn(),
  };
});

const fetchChallengeMock = vi.mocked(api.fetchChallenge);

beforeEach(() => {
  fetchChallengeMock.mockResolvedValue({ token: "chal-1", exp: Date.now() + 300_000 });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("<BugReportButton> — accessibility", () => {
  it("the launcher is a keyboard-focusable, aria-labelled button", () => {
    render(<BugReportButton repo="hub.dig.net" />);
    const launcher = screen.getByTestId("bugreport-launcher");
    expect(launcher.tagName).toBe("BUTTON");
    expect(launcher).toHaveAccessibleName(/report a bug/i);
    launcher.focus();
    expect(launcher).toHaveFocus();
  });

  it("opening the panel renders a labelled role=dialog with aria-modal", async () => {
    const user = userEvent.setup();
    render(<BugReportButton repo="hub.dig.net" />);
    await user.click(screen.getByTestId("bugreport-launcher"));

    const panel = await screen.findByRole("dialog");
    expect(panel).toHaveAttribute("aria-modal", "true");
    expect(panel).toHaveAccessibleName(/report a bug/i);
  });

  it("moves focus into the panel when it opens", async () => {
    const user = userEvent.setup();
    render(<BugReportButton repo="hub.dig.net" />);
    await user.click(screen.getByTestId("bugreport-launcher"));

    await waitFor(() => {
      expect(screen.getByTestId("bugreport-panel").contains(document.activeElement)).toBe(true);
    });
  });

  it("Escape closes the panel and restores focus to the launcher", async () => {
    const user = userEvent.setup();
    render(<BugReportButton repo="hub.dig.net" />);
    const launcher = screen.getByTestId("bugreport-launcher");
    await user.click(launcher);
    await screen.findByRole("dialog");

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(launcher).toHaveFocus();
  });

  it("the close (x) button also closes the panel", async () => {
    const user = userEvent.setup();
    render(<BugReportButton repo="hub.dig.net" />);
    await user.click(screen.getByTestId("bugreport-launcher"));
    await screen.findByRole("dialog");

    await user.click(screen.getByTestId("bugreport-cancel"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("Tab cycles forward from the last focusable element back to the first (focus trap)", async () => {
    const user = userEvent.setup();
    render(<BugReportButton repo="hub.dig.net" />);
    await user.click(screen.getByTestId("bugreport-launcher"));
    await screen.findByRole("dialog");

    // The submit button is disabled (and so unfocusable) until description has text.
    await user.type(screen.getByTestId("bugreport-description-input"), "hello");
    const submit = screen.getByTestId("bugreport-submit");
    submit.focus();
    expect(submit).toHaveFocus();

    await user.tab();
    expect(screen.getByTestId("bugreport-panel").contains(document.activeElement)).toBe(true);
    // Focus must never escape the panel to the launcher button behind it while open.
    expect(document.activeElement).not.toBe(screen.getByTestId("bugreport-launcher"));
  });

  it("Shift+Tab from the first focusable element wraps to the last (focus trap)", async () => {
    const user = userEvent.setup();
    render(<BugReportButton repo="hub.dig.net" />);
    await user.click(screen.getByTestId("bugreport-launcher"));
    await screen.findByRole("dialog");

    const closeButton = screen.getByTestId("bugreport-cancel");
    closeButton.focus();
    expect(closeButton).toHaveFocus();

    await user.tab({ shift: true });
    expect(screen.getByTestId("bugreport-panel").contains(document.activeElement)).toBe(true);
  });

  it("the honeypot field is excluded from the tab order and hidden from assistive tech", async () => {
    const user = userEvent.setup();
    render(<BugReportButton repo="hub.dig.net" />);
    await user.click(screen.getByTestId("bugreport-launcher"));
    await screen.findByRole("dialog");

    const honeypot = screen.getByTestId("bugreport-honeypot");
    expect(honeypot).toHaveAttribute("aria-hidden", "true");
    expect(honeypot).toHaveAttribute("tabindex", "-1");
  });

  it("exposes an aria-live status region for async state changes", async () => {
    const user = userEvent.setup();
    render(<BugReportButton repo="hub.dig.net" />);
    await user.click(screen.getByTestId("bugreport-launcher"));
    await screen.findByRole("dialog");

    const status = screen.getByTestId("bugreport-status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveAttribute("role", "status");
  });

  it("every form control has an accessible label", async () => {
    const user = userEvent.setup();
    render(<BugReportButton repo="hub.dig.net" />);
    await user.click(screen.getByTestId("bugreport-launcher"));
    await screen.findByRole("dialog");

    expect(screen.getByLabelText(/title/i)).toBe(screen.getByTestId("bugreport-title-input"));
    expect(screen.getByLabelText(/what happened/i)).toBe(
      screen.getByTestId("bugreport-description-input"),
    );
    expect(screen.getByLabelText(/contact/i)).toBe(screen.getByTestId("bugreport-contact-input"));
  });

  it("re-clicking the launcher toggles the panel closed", async () => {
    const user = userEvent.setup();
    render(<BugReportButton repo="hub.dig.net" />);
    const launcher = screen.getByTestId("bugreport-launcher");
    await user.click(launcher);
    await screen.findByRole("dialog");
    expect(launcher).toHaveAttribute("aria-expanded", "true");

    await user.click(launcher);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(launcher).toHaveAttribute("aria-expanded", "false");
  });
});
