import { describe, it, expect, vi, afterEach } from "vitest";
import { attemptAutoCapture, readFileAsDataUrl } from "../src/BugReportButton/screenshotCapture";

describe("attemptAutoCapture", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    // @ts-expect-error test cleanup of a non-standard nav property
    delete (navigator as unknown as { mediaDevices?: unknown }).mediaDevices;
  });

  it("resolves null when getDisplayMedia is unsupported (no navigator.mediaDevices)", async () => {
    const result = await attemptAutoCapture();
    expect(result).toBeNull();
  });

  it("resolves null when the user declines/cancels the screen picker", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getDisplayMedia: vi.fn().mockRejectedValue(new DOMException("Permission denied")) },
    });
    const result = await attemptAutoCapture();
    expect(result).toBeNull();
  });

  it("captures one frame and returns a PNG data URL, then stops all tracks", async () => {
    const stopVideo = vi.fn();
    const stopAudio = vi.fn();
    const fakeStream = {
      getVideoTracks: () => [{ stop: stopVideo }],
      getTracks: () => [{ stop: stopVideo }, { stop: stopAudio }],
    } as unknown as MediaStream;

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getDisplayMedia: vi.fn().mockResolvedValue(fakeStream) },
    });

    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
      "data:image/png;base64,FAKE",
    );

    const result = await attemptAutoCapture();

    expect(result).toBe("data:image/png;base64,FAKE");
    expect(drawImage).toHaveBeenCalled();
    expect(stopVideo).toHaveBeenCalled();
    expect(stopAudio).toHaveBeenCalled();
  });

  it("resolves null when the canvas 2d context is unavailable", async () => {
    const fakeStream = {
      getVideoTracks: () => [{ stop: vi.fn() }],
      getTracks: () => [{ stop: vi.fn() }],
    } as unknown as MediaStream;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getDisplayMedia: vi.fn().mockResolvedValue(fakeStream) },
    });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);

    const result = await attemptAutoCapture();
    expect(result).toBeNull();
  });
});

describe("readFileAsDataUrl", () => {
  it("resolves with the data URL produced by FileReader", async () => {
    const file = new File(["hello"], "shot.png", { type: "image/png" });
    const result = await readFileAsDataUrl(file);
    expect(result).toMatch(/^data:image\/png;base64,/);
  });
});
