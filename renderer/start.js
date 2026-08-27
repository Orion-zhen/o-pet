((browser, modules) => {
  browser.document.addEventListener("contextmenu", (event) => event.preventDefault());
  const renderer = modules.OPetRenderer.create({
    clock: browser,
    document: browser.document,
    frameClock: browser,
    motionQuery: browser.matchMedia("(prefers-reduced-motion: reduce)"),
    now: () => browser.performance.now(),
    pointerTarget: browser,
    random: browser.Math.random,
    svg: browser.document.getElementById("pet"),
    viewportWidth: () => browser.innerWidth,
    postDrag(message) {
      browser.oPetNative.postDrag(message);
    },
  });
  browser.oPet = Object.freeze({
    setPreferences: renderer.setPreferences,
    showAction: renderer.showAction,
    update: renderer.update,
  });
  browser.oPetNative.ready();
  browser.addEventListener("pagehide", renderer.destroy, { once: true });
})(globalThis, globalThis[Symbol.for("o-pet.renderer")]);
