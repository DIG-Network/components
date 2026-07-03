/**
 * Screenshot capture ladder for <BugReportButton>. Best-effort only: every step is wrapped so a
 * failure (unsupported API, user declines the picker, cross-origin canvas taint, …) falls through
 * to `null` and the component shows the plain file-attach fallback instead. Nothing here ever
 * transmits anything — it only produces a data URL the component previews and the user must
 * explicitly send.
 */

type DisplayMediaCapableMediaDevices = MediaDevices & {
  getDisplayMedia?: (constraints?: MediaStreamConstraints) => Promise<MediaStream>;
};

/**
 * Try to capture one frame of a user-picked screen/window/tab via
 * `navigator.mediaDevices.getDisplayMedia`. Resolves `null` (never throws) when the API is
 * unsupported, the user declines the picker, or rendering the frame fails for any reason.
 */
export async function attemptAutoCapture(): Promise<string | null> {
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
