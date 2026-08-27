// @ts-check
import { create } from "./host.js";

/**
 * @param {Window & typeof globalThis} browser
 * @param {typeof create} [createRenderer]
 */
function start(browser, createRenderer = create) {
  browser.document.addEventListener("contextmenu", (event) =>
    event.preventDefault(),
  );
  const svg = /** @type {SVGSVGElement | null} */ (
    browser.document.querySelector("svg#pet")
  );
  if (svg === null) throw new Error("渲染页面缺少 #pet SVG");
  const renderer = createRenderer({
    clock: browser,
    document: browser.document,
    frameClock: browser,
    motionQuery: browser.matchMedia("(prefers-reduced-motion: reduce)"),
    now: () => browser.performance.now(),
    pointerTarget: browser,
    random: browser.Math.random,
    svg,
    viewportWidth: () => browser.innerWidth,
    /** @param {import("./types.js").DragMessage} message */
    postDrag(message) {
      browser.oPetNative.postDrag(message);
    },
  });
  browser.oPet = Object.freeze({
    finishNativeDrag: renderer.finishNativeDrag,
    setPreferences: renderer.setPreferences,
    showAction: renderer.showAction,
    update: renderer.update,
  });
  browser.oPetNative.ready();
  browser.addEventListener("pagehide", renderer.destroy, { once: true });
}

export { start };
