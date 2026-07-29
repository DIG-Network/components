import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BugReportButton } from "../src/BugReportButton/BugReportButton";
import { DEFAULT_MESSAGES } from "../src/BugReportButton/messages";
import type { BugReportMessages } from "../src/BugReportButton/messages";
import * as api from "../src/BugReportButton/api";
import * as screenshotCapture from "../src/BugReportButton/screenshotCapture";

vi.mock("../src/BugReportButton/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/BugReportButton/api")>();
  return { ...actual, fetchChallenge: vi.fn(), submitReport: vi.fn() };
});

vi.mock("../src/BugReportButton/screenshotCapture", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/BugReportButton/screenshotCapture")>();
  return { ...actual, captureViewportScreenshot: vi.fn(), captureScreenViaDisplayMedia: vi.fn() };
});

const fetchChallengeMock = vi.mocked(api.fetchChallenge);
const submitReportMock = vi.mocked(api.submitReport);
const captureViewportScreenshotMock = vi.mocked(screenshotCapture.captureViewportScreenshot);

async function openPanel(messages?: Partial<BugReportMessages>): Promise<void> {
  const user = userEvent.setup();
  render(<BugReportButton repo="hub.dig.net" messages={messages} />);
  await user.click(screen.getByTestId("bugreport-launcher"));
  await waitFor(() => expect(fetchChallengeMock).toHaveBeenCalled());
}

beforeEach(() => {
  captureViewportScreenshotMock.mockResolvedValue(null);
  fetchChallengeMock.mockResolvedValue({ token: "chal-1", exp: Date.now() + 5 * 60_000 });
  submitReportMock.mockResolvedValue({ status: "accepted", id: "r-1", issue: null });
});

afterEach(() => vi.clearAllMocks());

describe("<BugReportButton> — i18n messages", () => {
  it("renders the English defaults when no messages prop is supplied", async () => {
    await openPanel();
    expect(screen.getByRole("heading", { name: DEFAULT_MESSAGES.panelHeading })).toBeInTheDocument();
    expect(screen.getByTestId("bugreport-title-input")).toHaveAttribute(
      "placeholder",
      DEFAULT_MESSAGES.titlePlaceholder,
    );
    expect(screen.getByTestId("bugreport-submit")).toHaveTextContent(DEFAULT_MESSAGES.submitButton);
  });

  it("renders overridden strings and falls back to English for un-overridden keys", async () => {
    await openPanel({
      panelHeading: "Signaler un bug",
      submitButton: "Envoyer le rapport",
    });

    // Overridden keys render the translation…
    expect(screen.getByRole("heading", { name: "Signaler un bug" })).toBeInTheDocument();
    expect(screen.getByTestId("bugreport-submit")).toHaveTextContent("Envoyer le rapport");

    // …while un-overridden keys keep the English default.
    expect(screen.getByTestId("bugreport-title-input")).toHaveAttribute(
      "placeholder",
      DEFAULT_MESSAGES.titlePlaceholder,
    );
    expect(screen.getByText(DEFAULT_MESSAGES.panelSubtitle)).toBeInTheDocument();
  });

  it("preserves a verbatim brand/scheme token embedded in a translated string", async () => {
    // A host translation may wrap a non-translatable brand token; the widget renders it verbatim.
    await openPanel({ panelSubtitle: "Rapports directs vers l'équipe $DIG (chia://)." });
    expect(screen.getByText("Rapports directs vers l'équipe $DIG (chia://).")).toBeInTheDocument();
  });
});
