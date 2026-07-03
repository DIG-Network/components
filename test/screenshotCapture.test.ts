import { describe, it, expect, vi, afterEach } from "vitest";
import {
  captureViewportScreenshot,
  captureScreenViaDisplayMedia,
  rasterizeSvg,
  readFileAsDataUrl,
} from "../src/BugReportButton/screenshotCapture";
import { WIDGET_MARKER_ATTR } from "../src/BugReportButton/domSnapshot";

/** Fake Image that "loads" any src on the next microtask, so rasterization can run in jsdom. */
class InstantlyLoadingImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  width = 0;
  height = 0;
  set src(_value: string) {
    queueMicrotask(() => this.onload?.());
  }
}

/** Fake Image that fails to load. */
class FailingImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_value: string) {
    queueMicrotask(() => this.onerror?.());
  }
}

function stubCanvas(dataUrl = "data:image/png;base64,RASTERIZED") {
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage,
    scale: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(dataUrl);
  return { drawImage };
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (navigator as any).mediaDevices;
});

describe("captureViewportScreenshot (the automatic path)", () => {
  it("NEVER invokes getDisplayMedia — auto-capture is DOM-based only", async () => {
    const getDisplayMedia = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getDisplayMedia },
    });
    vi.stubGlobal("Image", InstantlyLoadingImage);
    stubCanvas();

    await captureViewportScreenshot();
    expect(getDisplayMedia).not.toHaveBeenCalled();
  });

  it("rasterizes the page DOM to a PNG data URL", async () => {
    document.body.innerHTML = `<main><h1>the page</h1></main>`;
    vi.stubGlobal("Image", InstantlyLoadingImage);
    const { drawImage } = stubCanvas();

    const result = await captureViewportScreenshot();
    expect(result).toBe("data:image/png;base64,RASTERIZED");
    expect(drawImage).toHaveBeenCalled();
  });

  it("excludes widget-marked elements from the capture (snapshot taken synchronously at call time)", async () => {
    document.body.innerHTML = `
      <main>page body</main>
      <div ${WIDGET_MARKER_ATTR}="">PANEL-MUST-NOT-APPEAR</div>
    `;
    let capturedSvg = "";
    vi.stubGlobal(
      "Image",
      class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(value: string) {
          capturedSvg = decodeURIComponent(value.replace("data:image/svg+xml;charset=utf-8,", ""));
          queueMicrotask(() => this.onload?.());
        }
      },
    );
    stubCanvas();

    const promise = captureViewportScreenshot();
    // Simulate the panel mounting right after capture begins: it must not leak into the shot.
    const late = document.createElement("div");
    late.textContent = "MOUNTED-AFTER-CLICK";
    document.body.appendChild(late);

    await promise;
    expect(capturedSvg).toContain("page body");
    expect(capturedSvg).not.toContain("PANEL-MUST-NOT-APPEAR");
    expect(capturedSvg).not.toContain("MOUNTED-AFTER-CLICK");
  });

  it("resolves null (never throws) when rasterization fails", async () => {
    vi.stubGlobal("Image", FailingImage);
    const result = await captureViewportScreenshot();
    expect(result).toBeNull();
  });

  it("resolves null when the canvas 2d context is unavailable", async () => {
    vi.stubGlobal("Image", InstantlyLoadingImage);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const result = await captureViewportScreenshot();
    expect(result).toBeNull();
  });
});

describe("rasterizeSvg", () => {
  it("resolves null on image load error", async () => {
    vi.stubGlobal("Image", FailingImage);
    const result = await rasterizeSvg("<svg></svg>", 100, 100);
    expect(result).toBeNull();
  });

  it("resolves null after the timeout when the image never loads", async () => {
    vi.stubGlobal(
      "Image",
      class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_v: string) {
          /* never loads */
        }
      },
    );
    const result = await rasterizeSvg("<svg></svg>", 100, 100, 30);
    expect(result).toBeNull();
  });
});

describe("captureScreenViaDisplayMedia (the explicit opt-in fallback)", () => {
  it("resolves null when getDisplayMedia is unsupported", async () => {
    const result = await captureScreenViaDisplayMedia();
    expect(result).toBeNull();
  });

  it("resolves null when the user declines the screen picker", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getDisplayMedia: vi.fn().mockRejectedValue(new DOMException("Permission denied")) },
    });
    const result = await captureScreenViaDisplayMedia();
    expect(result).toBeNull();
  });

  it("captures one frame, returns a PNG data URL, and stops all tracks", async () => {
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
    const { drawImage } = stubCanvas("data:image/png;base64,SCREEN");

    const result = await captureScreenViaDisplayMedia();

    expect(result).toBe("data:image/png;base64,SCREEN");
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

    const result = await captureScreenViaDisplayMedia();
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

describe("rasterizeSvg — page background backfill", () => {
  it("fills the canvas with the page background before drawing the SVG", async () => {
    vi.stubGlobal("Image", InstantlyLoadingImage);
    const fillRect = vi.fn();
    const drawImage = vi.fn();
    const ctx = { drawImage, fillRect, fillStyle: "" } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,BG");

    const result = await rasterizeSvg("<svg></svg>", 100, 50, 4000, "rgb(244, 242, 249)");
    expect(result).toBe("data:image/png;base64,BG");
    expect(fillRect).toHaveBeenCalledWith(0, 0, 100, 50);
    expect((ctx as unknown as { fillStyle: string }).fillStyle).toBe("rgb(244, 242, 249)");
  });

  it("skips the backfill when no background is provided", async () => {
    vi.stubGlobal("Image", InstantlyLoadingImage);
    const fillRect = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
      fillRect,
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,X");

    await rasterizeSvg("<svg></svg>", 10, 10);
    expect(fillRect).not.toHaveBeenCalled();
  });
});
