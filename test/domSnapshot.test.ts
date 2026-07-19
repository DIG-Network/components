import { describe, it, expect, vi, afterEach } from "vitest";
import {
  cloneViewport,
  inlineImages,
  serializeToSvg,
  WIDGET_MARKER_ATTR,
} from "../src/BugReportButton/domSnapshot";

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("cloneViewport", () => {
  it("excludes every element marked with the widget marker attribute", () => {
    document.body.innerHTML = `
      <main><p>visible page content</p></main>
      <button ${WIDGET_MARKER_ATTR}="">WIDGET-LAUNCHER</button>
      <div ${WIDGET_MARKER_ATTR}=""><p>WIDGET-PANEL-CONTENT</p></div>
    `;
    const snapshot = cloneViewport(document);
    expect(snapshot).not.toBeNull();
    const html = snapshot!.root.outerHTML;
    expect(html).toContain("visible page content");
    expect(html).not.toContain("WIDGET-LAUNCHER");
    expect(html).not.toContain("WIDGET-PANEL-CONTENT");
  });

  it("drops script, style, link, noscript and iframe elements", () => {
    document.body.innerHTML = `
      <p>keep me</p>
      <script>var SECRET_JS = 1;</script>
      <style>.x { color: red }</style>
      <iframe src="https://evil.example/"></iframe>
      <noscript>no js</noscript>
    `;
    const snapshot = cloneViewport(document);
    const html = snapshot!.root.outerHTML;
    expect(html).toContain("keep me");
    expect(html).not.toContain("SECRET_JS");
    expect(html).not.toContain("evil.example");
    expect(html.toLowerCase()).not.toContain("<script");
    expect(html.toLowerCase()).not.toContain("<style");
    expect(html.toLowerCase()).not.toContain("<iframe");
  });

  it("is synchronous: DOM mutations after the call do not appear in the clone", () => {
    document.body.innerHTML = `<p>original content</p>`;
    const snapshot = cloneViewport(document);

    const late = document.createElement("div");
    late.textContent = "ADDED-AFTER-SNAPSHOT";
    document.body.appendChild(late);

    expect(snapshot!.root.outerHTML).toContain("original content");
    expect(snapshot!.root.outerHTML).not.toContain("ADDED-AFTER-SNAPSHOT");
  });

  it("reflects live input and textarea values into the clone", () => {
    document.body.innerHTML = `<input id="i" /><textarea id="t"></textarea>`;
    (document.getElementById("i") as HTMLInputElement).value = "typed-input-value";
    (document.getElementById("t") as HTMLTextAreaElement).value = "typed-textarea-value";

    const snapshot = cloneViewport(document);
    const html = snapshot!.root.outerHTML;
    expect(html).toContain("typed-input-value");
    expect(html).toContain("typed-textarea-value");
  });

  it("reflects checkbox checked state into the clone", () => {
    document.body.innerHTML = `<input type="checkbox" id="c" />`;
    (document.getElementById("c") as HTMLInputElement).checked = true;

    const snapshot = cloneViewport(document);
    expect(snapshot!.root.outerHTML).toContain("checked");
  });

  it("reports viewport dimensions", () => {
    const snapshot = cloneViewport(document);
    expect(snapshot!.width).toBeGreaterThan(0);
    expect(snapshot!.height).toBeGreaterThan(0);
  });
});

describe("inlineImages", () => {
  it("replaces a same-origin img src with a data URL", async () => {
    const blob = new Blob(["png-bytes"], { type: "image/png" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) }));

    const root = document.createElement("div");
    root.innerHTML = `<img src="https://example.test/pic.png" />`;
    await inlineImages(root);

    const img = root.querySelector("img")!;
    expect(img.getAttribute("src")).toMatch(/^data:/);
  });

  it("removes the src of an image that cannot be fetched (so the SVG render never references the network)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("blocked")));

    const root = document.createElement("div");
    root.innerHTML = `<img src="https://cross-origin.test/pic.png" alt="x" />`;
    await inlineImages(root);

    expect(root.querySelector("img")!.hasAttribute("src")).toBe(false);
  });

  it("leaves data: URLs untouched and never fetches them", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const root = document.createElement("div");
    root.innerHTML = `<img src="data:image/png;base64,AAAA" />`;
    await inlineImages(root);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(root.querySelector("img")!.getAttribute("src")).toBe("data:image/png;base64,AAAA");
  });

  it("scrubs external url() references out of inline style attributes", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const root = document.createElement("div");
    root.innerHTML = `<div style="background-image: url(https://cdn.test/bg.png); color: red;"></div>`;
    await inlineImages(root);

    const style = root.querySelector("div")!.getAttribute("style")!;
    expect(style).not.toContain("cdn.test");
    expect(style).toContain("color: red");
  });
});

describe("serializeToSvg", () => {
  it("wraps the clone in an SVG foreignObject with the XHTML namespace", () => {
    const root = document.createElement("div");
    root.innerHTML = `<p>serialized body</p>`;
    const svg = serializeToSvg(root, 800, 600);

    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain("<foreignObject");
    expect(svg).toContain("http://www.w3.org/1999/xhtml");
    expect(svg).toContain("serialized body");
    expect(svg).toContain('width="800"');
    expect(svg).toContain('height="600"');
  });
});

describe("cloneViewport — edge branches", () => {
  it("reflects a selected option into the clone", () => {
    document.body.innerHTML = `
      <select id="s">
        <option value="a">A</option>
        <option value="b">B</option>
      </select>
    `;
    (document.getElementById("s") as HTMLSelectElement).value = "b";
    const snapshot = cloneViewport(document);
    const options = snapshot!.root.querySelectorAll("option");
    expect(options[1]!.hasAttribute("selected")).toBe(true);
    expect(options[0]!.hasAttribute("selected")).toBe(false);
  });

  it("never copies password or file input values", () => {
    document.body.innerHTML = `<input type="password" id="p" />`;
    (document.getElementById("p") as HTMLInputElement).value = "hunter2";
    const snapshot = cloneViewport(document);
    expect(snapshot!.root.outerHTML).not.toContain("hunter2");
  });

  it("replaces or drops canvas elements (jsdom canvas cannot export, so it is dropped)", () => {
    document.body.innerHTML = `<canvas id="c"></canvas><p>after canvas</p>`;
    const snapshot = cloneViewport(document);
    // jsdom's canvas.toDataURL throws -> the canvas is omitted; the rest of the page survives.
    expect(snapshot!.root.outerHTML.toLowerCase()).not.toContain("<canvas");
    expect(snapshot!.root.outerHTML).toContain("after canvas");
  });
});

describe("inlineImages — edge branches", () => {
  it("removes the src when the fetch responds non-ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, blob: () => Promise.resolve(new Blob()) }));
    const root = document.createElement("div");
    root.innerHTML = `<img src="https://example.test/404.png" />`;
    await inlineImages(root);
    expect(root.querySelector("img")!.hasAttribute("src")).toBe(false);
  });

  it("skips img elements with no src at all", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const root = document.createElement("div");
    root.innerHTML = `<img alt="decorative" />`;
    await inlineImages(root);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("strips srcset so no external candidate can load in the SVG render", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("no")));
    const root = document.createElement("div");
    root.innerHTML = `<img src="https://x.test/a.png" srcset="https://x.test/a2.png 2x" />`;
    await inlineImages(root);
    expect(root.querySelector("img")!.hasAttribute("srcset")).toBe(false);
  });
});
