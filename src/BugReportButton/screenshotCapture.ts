/**
 * Screenshot capture for <BugReportButton>. Three tiers, strictly ordered:
 *
 *  1. **Automatic (default): in-page DOM rasterization** — {@link captureViewportScreenshot}.
 *     Synchronously snapshots the page DOM (excluding the widget's own UI via the
 *     `data-dig-bugreport` marker) and rasterizes it to a PNG data URL via SVG foreignObject.
 *     No permission prompt, no picker, and the resulting image shows the page exactly as the
 *     user saw it — WITHOUT the bug panel or launcher. `getDisplayMedia` is NEVER called here.
 *  2. **Explicit opt-in: screen capture** — {@link captureScreenViaDisplayMedia}. Only runs when
 *     the user presses "Capture screen" (for content DOM rasterization can't render:
 *     cross-origin iframes, WebGL, …). The component hides its own chrome first.
 *  3. **Manual: file attach** — {@link readFileAsDataUrl}.
 *
 * Every tier is best-effort: failures resolve `null` (never throw) and the component keeps the
 * remaining fallbacks available. Nothing here transmits anything — capture only produces a data
 * URL the panel previews and the user must explicitly send (and can remove).
 */
import { cloneViewport, inlineImages, serializeToSvg } from "./domSnapshot";

type DisplayMediaCapableMediaDevices = MediaDevices & {
  getDisplayMedia?: (constraints?: MediaStreamConstraints) => Promise<MediaStream>;
};

/**
 * Rasterize standalone SVG markup to a PNG data URL at CSS-pixel scale (keeps the payload small,
 * comfortably under the server's decoded-size cap). Resolves null on load error, draw failure, a
 * missing 2d context, or after `timeoutMs` if the image never loads.
 */
export function rasterizeSvg(
  svg: string,
  width: number,
  height: number,
  timeoutMs = 4000,
  background: string | null = null,
): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      const timer = setTimeout(() => resolve(null), timeoutMs);
      img.onload = () => {
        clearTimeout(timer);
        try {
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(null);
            return;
          }
          if (background) {
            // Backfill with the page background so short pages don't sit on a white void.
            ctx.fillStyle = background;
            ctx.fillRect(0, 0, width, height);
          }
          ctx.drawImage(img as unknown as CanvasImageSource, 0, 0, width, height);
          resolve(canvas.toDataURL("image/png"));
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => {
        clearTimeout(timer);
        resolve(null);
      };
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    } catch {
      resolve(null);
    }
  });
}

/**
 * The automatic capture path: DOM rasterization of the current viewport.
 *
 * The DOM clone happens SYNCHRONOUSLY inside this call — invoke it BEFORE mounting the report
 * panel and the panel can never appear in the shot (the widget's launcher is excluded by its
 * `data-dig-bugreport` marker regardless). The async remainder (image inlining + rasterization)
 * operates only on the detached clone. Resolves null on any failure; never throws; never calls
 * `getDisplayMedia`.
 */
export function captureViewportScreenshot(doc: Document = document): Promise<string | null> {
  try {
    const snapshot = cloneViewport(doc); // sync — completes before the caller opens the panel
    if (!snapshot) return Promise.resolve(null);
    return (async () => {
      await inlineImages(snapshot.root);
      const svg = serializeToSvg(snapshot.root, snapshot.width, snapshot.height);
      return await rasterizeSvg(svg, snapshot.width, snapshot.height, 4000, snapshot.background);
    })().catch(() => null);
  } catch {
    return Promise.resolve(null);
  }
}

/**
 * The EXPLICIT opt-in fallback: capture one frame of a user-picked screen/window/tab via
 * `navigator.mediaDevices.getDisplayMedia`. Only ever invoked from the panel's "Capture screen"
 * button — never automatically (the browser picker is intrusive and the frame may include
 * overlapping UI, which is exactly why DOM rasterization is the default). Resolves `null` (never
 * throws) when the API is unsupported, the user declines the picker, or rendering fails.
 */
export async function captureScreenViaDisplayMedia(): Promise<string | null> {
  const mediaDevices = navigator.mediaDevices as DisplayMediaCapableMediaDevices | undefined;
  if (!mediaDevices?.getDisplayMedia) return null;

  let stream: MediaStream | null = null;
  try {
    stream = await mediaDevices.getDisplayMedia({ video: true });

    const video = document.createElement("video");
    video.srcObject = stream;
    video.muted = true;
    await video.play().catch(() => undefined);

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1;
    canvas.height = video.videoHeight || 1;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  } finally {
    stream?.getTracks().forEach((track) => track.stop());
  }
}

/** Read a user-attached file (the manual fallback) as a data URL for preview + submission. */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}
