/**
 * Behavior tests for the v0.1.1 capture pipeline: automatic DOM screenshot (clean page, widget
 * excluded, getDisplayMedia NEVER auto-invoked), the explicit "Capture screen" opt-in, network
 * error capture + panel surfacing + payload merging, and app-version auto-detection.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
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
const captureScreenMock = vi.mocked(screenshotCapture.captureScreenViaDisplayMedia);

const originalFetch = window.fetch;

beforeEach(() => {
  fetchChallengeMock.mockResolvedValue({ token: "chal-1", exp: Date.now() + 300_000 });
  submitReportMock.mockResolvedValue({ status: "accepted", id: "r-1", issue: null });
  captureViewportScreenshotMock.mockResolvedValue(null);
  captureScreenMock.mockResolvedValue(null);
});

afterEach(() => {
  window.fetch = originalFetch;
  document.head.querySelectorAll('meta[name="app-version"]').forEach((el) => el.remove());
  delete (window as { __APP_VERSION__?: unknown }).__APP_VERSION__;
  vi.clearAllMocks();
});

async function openPanel(ui = <BugReportButton repo="hub.dig.net" />) {
  const user = userEvent.setup();
  render(ui);
  await user.click(screen.getByTestId("bugreport-launcher"));
  await waitFor(() => expect(fetchChallengeMock).toHaveBeenCalled());
  return user;
}

describe("automatic screenshot (DOM rasterization)", () => {
  it("starts the DOM capture BEFORE the panel is in the DOM, and previews the result", async () => {
    captureViewportScreenshotMock.mockImplementation(() => {
      // The load-bearing sequencing contract: at capture time the panel must not exist yet,
      // so the screenshot shows the clean page underneath.
      expect(screen.queryByTestId("bugreport-panel")).not.toBeInTheDocument();
      return Promise.resolve("data:image/png;base64,AUTO");
    });

    await openPanel();
    expect(captureViewportScreenshotMock).toHaveBeenCalledTimes(1);

    await waitFor(() =>
      expect(screen.getByTestId("bugreport-screenshot-preview")).toHaveAttribute(
        "src",
        "data:image/png;base64,AUTO",
      ),
    );
    // The caption tells the user the shot is clean + reviewable.
    expect(screen.getByText(/captured automatically/i)).toBeInTheDocument();
  });

  it("NEVER invokes the screen-share path automatically", async () => {
    captureViewportScreenshotMock.mockResolvedValue("data:image/png;base64,AUTO");
    await openPanel();
    await waitFor(() => expect(screen.getByTestId("bugreport-screenshot-preview")).toBeInTheDocument());
    expect(captureScreenMock).not.toHaveBeenCalled();
  });

  it("the auto screenshot is removable, and removal excludes it from the payload", async () => {
    captureViewportScreenshotMock.mockResolvedValue("data:image/png;base64,AUTO");
    const user = await openPanel();
    await waitFor(() => expect(screen.getByTestId("bugreport-screenshot-preview")).toBeInTheDocument());

    await user.click(screen.getByTestId("bugreport-screenshot-remove"));
    expect(screen.queryByTestId("bugreport-screenshot-preview")).not.toBeInTheDocument();

    await user.type(screen.getByTestId("bugreport-description-input"), "desc");
    await user.click(screen.getByTestId("bugreport-submit"));
    await waitFor(() => expect(submitReportMock).toHaveBeenCalled());
    expect(submitReportMock.mock.calls[0]![1].screenshot).toBeUndefined();
  });

  it("a stale capture from a closed panel session never lands in a newer one", async () => {
    let resolveCapture: (value: string | null) => void = () => undefined;
    captureViewportScreenshotMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCapture = resolve;
      }),
    );
    captureViewportScreenshotMock.mockResolvedValueOnce(null);

    const user = userEvent.setup();
    render(<BugReportButton repo="hub.dig.net" />);
    const launcher = screen.getByTestId("bugreport-launcher");

    await user.click(launcher); // open #1 — capture pending
    await user.click(launcher); // close
    await user.click(launcher); // open #2 — capture resolves null

    await act(async () => {
      resolveCapture("data:image/png;base64,STALE"); // session #1 finally resolves
    });
    expect(screen.queryByTestId("bugreport-screenshot-preview")).not.toBeInTheDocument();
  });
});

describe("explicit 'Capture screen' opt-in", () => {
  it("invokes getDisplayMedia only when the user presses the button, then previews the frame", async () => {
    captureScreenMock.mockResolvedValue("data:image/png;base64,SCREEN");
    const user = await openPanel();
    expect(captureScreenMock).not.toHaveBeenCalled();

    await user.click(screen.getByTestId("bugreport-screen-capture"));
    await waitFor(() => expect(captureScreenMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId("bugreport-screenshot-preview")).toHaveAttribute(
        "src",
        "data:image/png;base64,SCREEN",
      ),
    );
  });

  it("keeps the previous state when the user cancels the picker", async () => {
    captureScreenMock.mockResolvedValue(null);
    const user = await openPanel();
    await user.click(screen.getByTestId("bugreport-screen-capture"));
    await waitFor(() => expect(captureScreenMock).toHaveBeenCalled());
    expect(screen.queryByTestId("bugreport-screenshot-preview")).not.toBeInTheDocument();
  });
});

describe("network-error capture in the panel + payload", () => {
  it("shows captured network errors in their own disclosure, expandable, with entries listed", async () => {
    window.fetch = vi.fn().mockResolvedValue(new Response("boom", { status: 502 }));
    const user = userEvent.setup();
    render(<BugReportButton repo="hub.dig.net" />);

    // A host-app request failing AFTER mount (the widget's wrap is installed) gets captured.
    await act(async () => {
      await window.fetch("https://api.host.test/data?auth=SECRET");
    });

    await user.click(screen.getByTestId("bugreport-launcher"));
    await waitFor(() => expect(fetchChallengeMock).toHaveBeenCalled());

    const toggle = screen.getByTestId("bugreport-network-toggle");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveTextContent(/network errors/i);
    expect(toggle).toHaveTextContent("1");

    await user.click(toggle);
    const list = screen.getByTestId("bugreport-network-list");
    expect(list).toBeVisible();
    expect(list).toHaveTextContent("GET https://api.host.test/data");
    expect(list).toHaveTextContent("502");
    expect(list).not.toHaveTextContent("SECRET");
  });

  it("merges network entries into console_logs with level 'network' on submit", async () => {
    window.fetch = vi.fn().mockResolvedValue(new Response("boom", { status: 502 }));
    const user = userEvent.setup();
    render(<BugReportButton repo="hub.dig.net" />);

    act(() => {
      // eslint-disable-next-line no-console -- interleave a console entry with the network one
      console.error("app exploded");
    });
    await act(async () => {
      await window.fetch("https://api.host.test/broken");
    });

    await user.click(screen.getByTestId("bugreport-launcher"));
    await waitFor(() => expect(fetchChallengeMock).toHaveBeenCalled());
    await user.type(screen.getByTestId("bugreport-description-input"), "desc");
    await user.click(screen.getByTestId("bugreport-submit"));

    await waitFor(() => expect(submitReportMock).toHaveBeenCalled());
    const [, payload] = submitReportMock.mock.calls[0]!;
    const logs = payload.console_logs!;
    const network = logs.filter((entry) => entry.level === "network");
    expect(network).toHaveLength(1);
    expect(network[0]!.text).toMatch(/^GET https:\/\/api\.host\.test\/broken → 502 \(\d+ms\)$/);
    // Console entries keep their own levels alongside.
    expect(logs.some((entry) => entry.level === "error" && entry.text.includes("app exploded"))).toBe(true);
    // Chronological interleave: ts_ms is non-decreasing.
    for (let i = 1; i < logs.length; i += 1) {
      expect(logs[i]!.ts_ms).toBeGreaterThanOrEqual(logs[i - 1]!.ts_ms);
    }
  });

  it("'Remove from report' on the network section excludes the entries from the payload", async () => {
    window.fetch = vi.fn().mockResolvedValue(new Response("boom", { status: 500 }));
    const user = userEvent.setup();
    render(<BugReportButton repo="hub.dig.net" />);
    await act(async () => {
      await window.fetch("https://api.host.test/private-failure");
    });

    await user.click(screen.getByTestId("bugreport-launcher"));
    await waitFor(() => expect(fetchChallengeMock).toHaveBeenCalled());

    await user.click(screen.getByTestId("bugreport-network-remove"));
    await user.type(screen.getByTestId("bugreport-description-input"), "desc");
    await user.click(screen.getByTestId("bugreport-submit"));

    await waitFor(() => expect(submitReportMock).toHaveBeenCalled());
    const [, payload] = submitReportMock.mock.calls[0]!;
    expect(payload.console_logs?.some((entry) => entry.level === "network") ?? false).toBe(false);
  });

  it("shows the instruction hint, switching copy when both buffers are empty", async () => {
    const user = await openPanel();
    expect(screen.getByTestId("bugreport-diagnostics-hint")).toHaveTextContent(
      /no console or network errors were captured/i,
    );

    act(() => {
      // eslint-disable-next-line no-console -- flips the hint to the "captured automatically" copy
      console.error("now there is one");
    });
    await user.click(screen.getByTestId("bugreport-cancel"));
    await user.click(screen.getByTestId("bugreport-launcher"));
    expect(screen.getByTestId("bugreport-diagnostics-hint")).toHaveTextContent(/captured automatically/i);
  });
});

describe("app version in the payload", () => {
  async function submitAndGetPayload(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByTestId("bugreport-description-input"), "desc");
    await user.click(screen.getByTestId("bugreport-submit"));
    await waitFor(() => expect(submitReportMock).toHaveBeenCalled());
    return submitReportMock.mock.calls[0]![1];
  }

  it("uses the explicit appVersion prop when given", async () => {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "app-version");
    meta.setAttribute("content", "9.9.9");
    document.head.appendChild(meta);

    const user = await openPanel(<BugReportButton repo="hub.dig.net" appVersion="1.0.0" />);
    const payload = await submitAndGetPayload(user);
    expect(payload.app_version).toBe("1.0.0");
  });

  it('auto-detects <meta name="app-version"> when the prop is omitted', async () => {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "app-version");
    meta.setAttribute("content", "4.5.6");
    document.head.appendChild(meta);

    const user = await openPanel();
    const payload = await submitAndGetPayload(user);
    expect(payload.app_version).toBe("4.5.6");
  });

  it("auto-detects window.__APP_VERSION__ as the last resort", async () => {
    (window as { __APP_VERSION__?: unknown }).__APP_VERSION__ = "7.8.9";
    const user = await openPanel();
    const payload = await submitAndGetPayload(user);
    expect(payload.app_version).toBe("7.8.9");
  });

  it("omits app_version when nothing provides it", async () => {
    const user = await openPanel();
    const payload = await submitAndGetPayload(user);
    expect(payload.app_version).toBeUndefined();
  });
});
