/**
 * Self-contained DOM→SVG snapshot used by the automatic screenshot path. No external library, no
 * CDN, no network fetches beyond inlining the page's OWN images — everything runs in-page under a
 * strict CSP.
 *
 * How it works (the classic foreignObject technique, vendored small):
 *  1. `cloneViewport` SYNCHRONOUSLY deep-clones `document.documentElement`, inlining each
 *     element's computed style (the SVG render has no access to the page's stylesheets), copying
 *     live form state, and EXCLUDING every element marked with {@link WIDGET_MARKER_ATTR} — the
 *     bug-report widget's own launcher/panel are never part of the shot. Because the clone is
 *     synchronous, anything mounted after the call (e.g. the report panel) cannot leak in.
 *  2. `inlineImages` asynchronously converts the clone's `<img>` sources to data URLs (an SVG
 *     rendered as an image may not load ANY external resource) and scrubs external `url(...)`
 *     references from inline styles.
 *  3. `serializeToSvg` wraps the clone in `<svg><foreignObject>` markup ready to rasterize.
 *
 * Everything is best-effort: any failure returns null upstream and the component falls back to
 * file-attach / explicit screen capture.
 */

/**
 * Marker attribute the widget stamps on its own root elements (launcher + overlay). Every element
 * carrying it — and its whole subtree — is excluded from the snapshot.
 */
export const WIDGET_MARKER_ATTR = "data-dig-bugreport";

/** Element kinds that never render in an SVG snapshot (or must not leak): dropped from the clone. */
const SKIPPED_TAGS = new Set([
  "script",
  "noscript",
  "style",
  "link",
  "meta",
  "title",
  "base",
  "iframe",
  "object",
  "embed",
  "template",
  "audio",
  "video",
  "source",
  "track",
]);

/** Soft cap: pages larger than this get a partial (top-of-tree) snapshot rather than a hang. */
const MAX_ELEMENTS = 6000;

/** Result of {@link cloneViewport}: a detached styled clone + the viewport box to render. */
export interface ViewportClone {
  root: HTMLElement;
  width: number;
  height: number;
  /**
   * The page's effective background color (body's, falling back to the root element's), used to
   * backfill the canvas so short pages don't rasterize onto a stark white void.
   */
  background: string | null;
}

/** Copy the element's computed style onto the clone as an inline `style` attribute. */
function inlineComputedStyle(source: Element, target: Element, view: Window): void {
  const computed = view.getComputedStyle(source);
  let cssText = "";
  for (let i = 0; i < computed.length; i += 1) {
    const prop = computed.item(i);
    cssText += `${prop}:${computed.getPropertyValue(prop)};`;
  }
  if (cssText) target.setAttribute("style", cssText);
}

/** Reflect live (JS-set) form state into serializable attributes on the clone. */
function reflectFormState(source: Element, target: Element): void {
  if (source instanceof HTMLInputElement) {
    const clone = target as HTMLInputElement;
    if (source.type === "checkbox" || source.type === "radio") {
      if (source.checked) clone.setAttribute("checked", "");
      else clone.removeAttribute("checked");
    } else if (source.type !== "password" && source.type !== "file") {
      clone.setAttribute("value", source.value);
    }
  } else if (source instanceof HTMLOptionElement) {
    if (source.selected) target.setAttribute("selected", "");
    else target.removeAttribute("selected");
  }
}

/** Replace a live `<canvas>` with a static `<img>` of its current pixels (tainted canvas → null). */
function snapshotCanvas(source: HTMLCanvasElement, doc: Document, view: Window): Element | null {
  try {
    const img = doc.createElement("img");
    img.setAttribute("src", source.toDataURL("image/png"));
    inlineComputedStyle(source, img, view);
    return img;
  } catch {
    return null; // tainted (cross-origin content) — omit rather than fail the whole shot
  }
}

/** Recursive worker for {@link cloneViewport}. Returns null for nodes that must be dropped. */
function cloneNodeDeep(node: Node, doc: Document, view: Window, budget: { remaining: number }): Node | null {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.cloneNode(false);
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return null;

  const el = node as Element;
  if (el.hasAttribute(WIDGET_MARKER_ATTR)) return null; // the widget never captures itself
  const tag = el.tagName.toLowerCase();
  if (SKIPPED_TAGS.has(tag)) return null;
  if (budget.remaining <= 0) return null;
  budget.remaining -= 1;

  if (el instanceof HTMLCanvasElement) return snapshotCanvas(el, doc, view);

  const clone = el.cloneNode(false) as Element;
  inlineComputedStyle(el, clone, view);
  reflectFormState(el, clone);

  // A textarea's VALUE (not its original text children) is what the user sees.
  if (el instanceof HTMLTextAreaElement) {
    clone.textContent = el.value;
    return clone;
  }

  for (let child = el.firstChild; child; child = child.nextSibling) {
    const childClone = cloneNodeDeep(child, doc, view, budget);
    if (childClone) clone.appendChild(childClone);
  }
  return clone;
}

/**
 * SYNCHRONOUSLY clone the page for capture. Returns null (never throws) when the document is
 * unavailable or cloning fails. Synchronicity is a load-bearing contract: the caller starts the
 * capture BEFORE mounting the report panel, so the panel can never appear in the screenshot.
 */
export function cloneViewport(doc: Document = document): ViewportClone | null {
  try {
    const view = doc.defaultView;
    const source = doc.documentElement;
    if (!view || !source) return null;

    const width = Math.max(1, view.innerWidth || source.clientWidth || 1);
    const height = Math.max(1, view.innerHeight || source.clientHeight || 1);

    const budget = { remaining: MAX_ELEMENTS };
    const root = cloneNodeDeep(source, doc, view, budget) as HTMLElement | null;
    if (!root) return null;

    // Shift the full-page clone so the CURRENT viewport region lands in the rendered box.
    const scrollX = view.scrollX || 0;
    const scrollY = view.scrollY || 0;
    if (scrollX || scrollY) {
      const existing = root.getAttribute("style") ?? "";
      root.setAttribute(
        "style",
        `${existing}transform:translate(${-scrollX}px, ${-scrollY}px);transform-origin:0 0;`,
      );
    }

    return { root, width, height, background: resolvePageBackground(doc, view) };
  } catch {
    return null;
  }
}

/** Effective page background: the body's, else the root element's, else null (transparent). */
function resolvePageBackground(doc: Document, view: Window): string | null {
  const opaque = (value: string | undefined): string | null =>
    value && value !== "transparent" && value !== "rgba(0, 0, 0, 0)" ? value : null;
  try {
    return (
      opaque(doc.body ? view.getComputedStyle(doc.body).backgroundColor : undefined) ??
      opaque(view.getComputedStyle(doc.documentElement).backgroundColor)
    );
  } catch {
    return null;
  }
}

/** Read a Blob as a data URL. */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read blob"));
    reader.readAsDataURL(blob);
  });
}

/** Fetch one image with a short timeout; resolve null on ANY failure (cross-origin, abort, …). */
async function fetchAsDataUrl(url: string, timeoutMs: number): Promise<string | null> {
  try {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const response = await fetch(url, { signal: controller?.signal });
      if (!response.ok) return null;
      return await blobToDataUrl(await response.blob());
    } finally {
      if (timer) clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

/** Matches `url(...)` tokens that do NOT reference a data: URL. */
const EXTERNAL_URL_TOKEN = /url\(\s*(?!["']?data:)[^)]*\)/gi;

/**
 * Prepare the clone for offline SVG rendering: inline `<img>` sources as data URLs (dropping any
 * that cannot be fetched) and scrub external `url(...)` references from inline styles. Best-effort
 * and bounded — a slow/failing image never blocks the capture for long.
 */
export async function inlineImages(root: Element, timeoutMs = 1500): Promise<void> {
  const images = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    images.map(async (img) => {
      img.removeAttribute("srcset"); // srcset would re-introduce external references
      const src = img.getAttribute("src");
      if (!src || src.startsWith("data:")) return;
      const dataUrl = await fetchAsDataUrl(src, timeoutMs);
      if (dataUrl) img.setAttribute("src", dataUrl);
      else img.removeAttribute("src");
    }),
  );

  // External url(...) in inline styles (background-image, masks, …) cannot load inside an
  // SVG-as-image render and can poison it — neutralize them.
  const styled = [root, ...Array.from(root.querySelectorAll("[style]"))];
  for (const el of styled) {
    const style = el.getAttribute?.("style");
    if (style && EXTERNAL_URL_TOKEN.test(style)) {
      el.setAttribute("style", style.replace(EXTERNAL_URL_TOKEN, "none"));
    }
    EXTERNAL_URL_TOKEN.lastIndex = 0; // reset the sticky /g regex between elements
  }
}

/** Wrap the prepared clone in standalone SVG markup sized to the viewport box. */
export function serializeToSvg(root: Element, width: number, height: number): string {
  root.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  const serialized = new XMLSerializer().serializeToString(root);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}">` +
    `<foreignObject width="100%" height="100%">${serialized}</foreignObject></svg>`
  );
}
