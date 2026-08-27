// @ts-check
/* 加载旋涡形变。 */

function create() {
  /** @param {import("./contracts.js").EffectLayer} _layer @param {import("./contracts.js").EffectSampleFrame} frame */
  function sampleOffset(_layer, frame) {
    if (frame.effectAmount <= 0.004) return {};
    const seconds = frame.now / 1000;
    return {
      xPx:
        (Math.sin(seconds * 0.9) * 2 + Math.sin(seconds * 1.7) * 0.8) *
        frame.effectAmount,
      yPx:
        (Math.sin(seconds * 1.3) * 2.4 +
          Math.sin(seconds * 0.6) * 1.2) *
        frame.effectAmount,
    };
  }

  return Object.freeze({
    id: "whirl",
    radius: 15,
    cameraZoom: 1.45,
    offsetOrder: 2,
    sampleOffset,
  });
}

export { create };
