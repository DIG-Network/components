import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BugReportButton } from "../src/BugReportButton/BugReportButton";
import * as api from "../src/BugReportButton/api";
import * as screenshotCapture from "../src/BugReportButton/screenshotCapture";

vi.mock("../src/BugReportButton/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/BugReportButton/api")>();
  return {
    ...actual,
    fetchChallenge: vi.fn(),
    submitReport: vi.fn(),
  };
});

// Rasterization needs a real browser; stub the capture layer (its own unit suite covers it).
vi.mock("../src/BugReportButton/screenshotCapture", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/BugReportButton/screenshotCapture")>();
  return {
    ...actual,
    captureViewportScreenshot: vi.fn(),
    captureScreenViaDisplayMedia: vi.fn(),
  };
});

const fetchChallengeMock = vi.mocked(api.fetchChallenge);
const submitReportMock = vi.mocked(api.submitReport);
const captureViewportScreenshotMock = vi.mocked(screenshotCapture.captureViewportScreenshot);

async function openPanel() {
  const user = userEvent.setup();
  render(<BugReportButton repo="hub.dig.net" />);
  await user.click(screen.getByTestId("bugreport-launcher"));
  await waitFor(() => expect(fetchChallengeMock).toHaveBeenCalled());
  return user;
}

beforeEach(() => {
  captureViewportScreenshotMock.mockResolvedValue(null);
});

describe("<BugReportButton> — challenge lifecycle", () => {
  beforeEach(() => {
    fetchChallengeMock.mockResolvedValue({ token: "chal-1", exp: Date.now() + 5 * 60_000 });
    submitReportMock.mockResolvedValue({ status: "accepted", id: "r-1", issue: null });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("fetches a challenge as soon as the panel opens", async () => {
    const user = userEvent.setup();
    render(<BugReportButton repo="hub.dig.net" apiBase="https://api.example.test" />);
    expect(fetchChallengeMock).not.toHaveBeenCalled();

    await user.click(screen.getByTestId("bugreport-launcher"));
    await waitFor(() => expect(fetchChallengeMock).toHaveBeenCalledWith("https://api.example.test"));
  });

  it("sends the fetched challenge_token, hp='', and opened_at_ms on submit", async () => {
    const user = userEvent.setup();
    render(<BugReportButton repo="xchtip.app" />);
    await user.click(screen.getByTestId("bugreport-launcher"));
    await waitFor(() => expect(fetchChallengeMock).toHaveBeenCalled());

    await user.type(screen.getByTestId("bugreport-description-input"), "It broke");
    await user.click(screen.getByTestId("bugreport-submit"));

    await waitFor(() => expect(submitReportMock).toHaveBeenCalled());
    const [, payload] = submitReportMock.mock.calls[0]!;
    expect(payload.repo).toBe("xchtip.app");
    expect(payload.description).toBe("It broke");
    expect(payload.challenge_token).toBe("chal-1");
    expect(payload.hp).toBe("");
    expect(typeof payload.opened_at_ms).toBe("number");
  });

  it("forwards a filled honeypot value verbatim (client never blocks — server decides)", async () => {
    const user = userEvent.setup();
    render(<BugReportButton repo="hub.dig.net" />);
    await user.click(screen.getByTestId("bugreport-launcher"));
    await waitFor(() => expect(fetchChallengeMock).toHaveBeenCalled());

    fireEvent.change(screen.getByTestId("bugreport-honeypot"), { target: { value: "im-a-bot" } });
    await user.type(screen.getByTestId("bugreport-description-input"), "desc");
    await user.click(screen.getByTestId("bugreport-submit"));

    await waitFor(() => expect(submitReportMock).toHaveBeenCalled());
    const [, payload] = submitReportMock.mock.calls[0]!;
    expect(payload.hp).toBe("im-a-bot");
  });

  it("refetches the challenge on a 403 challenge_expired response and shows an honest retry message", async () => {
    const user = userEvent.setup();
    submitReportMock.mockResolvedValueOnce({ status: "challenge_expired" });
    fetchChallengeMock
      .mockResolvedValueOnce({ token: "chal-1", exp: Date.now() + 300_000 })
      .mockResolvedValueOnce({ token: "chal-2", exp: Date.now() + 300_000 });

    render(<BugReportButton repo="hub.dig.net" />);
    await user.click(screen.getByTestId("bugreport-launcher"));
    await waitFor(() => expect(fetchChallengeMock).toHaveBeenCalledTimes(1));

    await user.type(screen.getByTestId("bugreport-description-input"), "desc");
    await user.click(screen.getByTestId("bugreport-submit"));

    await waitFor(() => expect(fetchChallengeMock).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("bugreport-error")).toHaveTextContent(/expired/i);

    // Retry reuses the freshly refetched token.
    submitReportMock.mockResolvedValueOnce({ status: "accepted", id: "r-2", issue: null });
    await user.click(screen.getByTestId("bugreport-submit"));
    await waitFor(() => expect(submitReportMock).toHaveBeenCalledTimes(2));
    const [, secondPayload] = submitReportMock.mock.calls[1]!;
    expect(secondPayload.challenge_token).toBe("chal-2");
  });
});

describe("<BugReportButton> — four states", () => {
  beforeEach(() => {
    fetchChallengeMock.mockResolvedValue({ token: "chal-1", exp: Date.now() + 300_000 });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("idle: renders the form with an enabled, non-disabled submit once description is filled", async () => {
    const user = await openPanel();
    expect(screen.getByTestId("bugreport-submit")).toBeDisabled();
    await user.type(screen.getByTestId("bugreport-description-input"), "hello");
    expect(screen.getByTestId("bugreport-submit")).toBeEnabled();
  });

  it("sending: disables the form and announces status via the live region", async () => {
    let resolveSubmit: (value: Awaited<ReturnType<typeof api.submitReport>>) => void = () => undefined;
    submitReportMock.mockReturnValue(
      new Promise((resolve) => {
        resolveSubmit = resolve;
      }),
    );
    const user = await openPanel();
    await user.type(screen.getByTestId("bugreport-description-input"), "hello");
    await user.click(screen.getByTestId("bugreport-submit"));

    expect(screen.getByTestId("bugreport-submit")).toBeDisabled();
    expect(screen.getByTestId("bugreport-status")).toHaveTextContent(/sending/i);

    resolveSubmit({ status: "accepted", id: "r-1", issue: null });
    await waitFor(() => expect(screen.getByTestId("bugreport-success")).toBeInTheDocument());
  });

  it("success: shows the report id and NO GitHub issue link (issue URLs are maintainer-internal)", async () => {
    submitReportMock.mockResolvedValue({
      status: "accepted",
      id: "abc-123",
      issue: { number: 7, url: "https://github.com/DIG-Network/hub.dig.net/issues/7" },
    });
    const user = await openPanel();
    await user.type(screen.getByTestId("bugreport-description-input"), "hello");
    await user.click(screen.getByTestId("bugreport-submit"));

    await waitFor(() => expect(screen.getByTestId("bugreport-success")).toBeInTheDocument());
    expect(screen.getByTestId("bugreport-report-id")).toHaveTextContent("abc-123");
    // Even when the API returns an issue reference, the UI must not surface it.
    expect(screen.queryByTestId("bugreport-issue-link")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByTestId("bugreport-status")).toHaveTextContent(/sent/i);
  });

  it("success: renders identically when no issue was returned", async () => {
    submitReportMock.mockResolvedValue({ status: "accepted", id: "abc-999", issue: null });
    const user = await openPanel();
    await user.type(screen.getByTestId("bugreport-description-input"), "hello");
    await user.click(screen.getByTestId("bugreport-submit"));

    await waitFor(() => expect(screen.getByTestId("bugreport-success")).toBeInTheDocument());
    expect(screen.getByTestId("bugreport-report-id")).toHaveTextContent("abc-999");
    expect(screen.queryByTestId("bugreport-issue-link")).not.toBeInTheDocument();
  });

  it("error (rate limited): shows an honest 'please wait' message and allows retry", async () => {
    submitReportMock.mockResolvedValue({ status: "rate_limited", message: "Please wait a bit." });
    const user = await openPanel();
    await user.type(screen.getByTestId("bugreport-description-input"), "hello");
    await user.click(screen.getByTestId("bugreport-submit"));

    await waitFor(() =>
      expect(screen.getByTestId("bugreport-error")).toHaveTextContent("Please wait a bit."),
    );
    expect(screen.getByTestId("bugreport-submit")).toHaveTextContent(/retry/i);
    expect(screen.getByTestId("bugreport-submit")).toBeEnabled();
  });

  it("error (generic): shows the server message and lets the user retry without losing the draft", async () => {
    submitReportMock.mockResolvedValueOnce({ status: "error", message: "Internal error." });
    submitReportMock.mockResolvedValueOnce({ status: "accepted", id: "r-3", issue: null });
    const user = await openPanel();
    await user.type(screen.getByTestId("bugreport-description-input"), "my precious bug report");
    await user.click(screen.getByTestId("bugreport-submit"));

    await waitFor(() => expect(screen.getByTestId("bugreport-error")).toHaveTextContent("Internal error."));
    expect(screen.getByTestId("bugreport-description-input")).toHaveValue("my precious bug report");

    await user.click(screen.getByTestId("bugreport-submit"));
    await waitFor(() => expect(screen.getByTestId("bugreport-success")).toBeInTheDocument());
  });

  it("never calls submitReport before the user explicitly clicks Send report", async () => {
    await openPanel();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(submitReportMock).not.toHaveBeenCalled();
  });
});

describe("<BugReportButton> — screenshot preview (file attach)", () => {
  beforeEach(() => {
    fetchChallengeMock.mockResolvedValue({ token: "chal-1", exp: Date.now() + 300_000 });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows the attach fallback with no preview when auto-capture fails", async () => {
    await openPanel();
    expect(screen.queryByTestId("bugreport-screenshot-preview")).not.toBeInTheDocument();
    expect(screen.getByTestId("bugreport-screenshot-file-input")).toBeInTheDocument();
  });

  it("lets the user attach a file, preview it, and remove it before sending", async () => {
    const user = await openPanel();
    const file = new File(["fake-bytes"], "shot.png", { type: "image/png" });
    const input = screen.getByTestId("bugreport-screenshot-file-input");
    await user.upload(input, file);

    await waitFor(() => expect(screen.getByTestId("bugreport-screenshot-preview")).toBeInTheDocument());

    await user.click(screen.getByTestId("bugreport-screenshot-remove"));
    expect(screen.queryByTestId("bugreport-screenshot-preview")).not.toBeInTheDocument();
  });

  it("includes the screenshot data URL in the submitted payload when present", async () => {
    submitReportMock.mockResolvedValue({ status: "accepted", id: "r-1", issue: null });
    const user = await openPanel();
    const file = new File(["fake-bytes"], "shot.png", { type: "image/png" });
    await user.upload(screen.getByTestId("bugreport-screenshot-file-input"), file);
    await waitFor(() => expect(screen.getByTestId("bugreport-screenshot-preview")).toBeInTheDocument());

    await user.type(screen.getByTestId("bugreport-description-input"), "hello");
    await user.click(screen.getByTestId("bugreport-submit"));

    await waitFor(() => expect(submitReportMock).toHaveBeenCalled());
    const [, payload] = submitReportMock.mock.calls[0]!;
    expect(payload.screenshot).toMatch(/^data:/);
  });
});

describe("<BugReportButton> — console log preview", () => {
  beforeEach(() => {
    fetchChallengeMock.mockResolvedValue({ token: "chal-1", exp: Date.now() + 300_000 });
    submitReportMock.mockResolvedValue({ status: "accepted", id: "r-1", issue: null });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("is collapsed by default and expands to show captured entries", async () => {
    render(<BugReportButton repo="hub.dig.net" />);
    // The capture-from-mount subscription updates component state synchronously, so this direct
    // console call (standing in for app code logging during normal use) is wrapped in act().
    act(() => {
      // eslint-disable-next-line no-console -- exercising the capture-from-mount behavior
      console.log("captured before opening the panel");
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("bugreport-launcher"));
    await waitFor(() => expect(fetchChallengeMock).toHaveBeenCalled());

    const toggle = screen.getByTestId("bugreport-console-toggle");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByTestId("bugreport-console-list")).not.toBeVisible();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("bugreport-console-list")).toBeVisible();
    expect(screen.getByTestId("bugreport-console-list")).toHaveTextContent(
      "captured before opening the panel",
    );
  });

  it("removing the console log excludes it from the next submission", async () => {
    render(<BugReportButton repo="hub.dig.net" />);
    act(() => {
      // eslint-disable-next-line no-console -- exercising removal of captured entries
      console.warn("sensitive detail");
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("bugreport-launcher"));
    await waitFor(() => expect(fetchChallengeMock).toHaveBeenCalled());

    await user.click(screen.getByTestId("bugreport-console-remove"));
    await user.type(screen.getByTestId("bugreport-description-input"), "hello");
    await user.click(screen.getByTestId("bugreport-submit"));

    await waitFor(() => expect(submitReportMock).toHaveBeenCalled());
    const [, payload] = submitReportMock.mock.calls[0]!;
    expect(payload.console_logs).toBeUndefined();
  });
});
