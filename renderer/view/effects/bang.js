// @ts-check
/* 审批警示符号。 */

/** @param {{ math: import("../../types.js").MathPort }} dependencies */
function create(dependencies) {
  const { clamp, Rc } = dependencies.math;
  /** @param {import("./contracts.js").EffectLayer} layer @param {import("./contracts.js").EffectPaintFrame} frame */
  function paint(layer, frame) {
    const glyph = layer.glyphs[2];
    if (glyph === undefined) throw new Error("警示符号节点缺失");
    const elapsed = (frame.now - frame.stateAt) / 1000;
    const enter = Rc(clamp(frame.amount * 1.1, 0, 1));
    const decay = Math.exp(-((elapsed % 2.2) * 5.5));
    const shake = Math.sin(elapsed * 42) * 2.2 * decay;
    glyph.style.display = "";
    glyph.setAttribute("d", layer.bangPath);
    glyph.style.fill = "var(--fg)";
    glyph.setAttribute(
      "transform",
      `translate(0 ${(-26 - (1 - enter) * 70).toFixed(1)}) rotate(${shake.toFixed(2)} ${frame.radius} ${(frame.radius - 74).toFixed(1)}) translate(${frame.radius} ${frame.radius}) scale(${clamp(frame.amount * 1.2, 0, 1).toFixed(3)}) translate(${-frame.radius} ${-frame.radius})`,
    );
    glyph.setAttribute(
      "opacity",
      clamp(frame.amount * 1.5 - 0.2, 0, 1).toFixed(3),
    );
  }
  /** @param {import("./contracts.js").EffectLayer} _layer @param {import("./contracts.js").EffectSampleFrame} frame */
  function sampleScale(_layer, frame) {
    return {
      multiplier:
        frame.effectAmount > 0.004
          ? 1 +
            0.04 *
              Math.exp(-(((frame.now - frame.stateAt) / 1000) % 2.2) * 5.5) *
              frame.effectAmount
          : 1,
    };
  }
  /** @param {import("./contracts.js").EffectLayer} _layer @param {import("./contracts.js").EffectSampleFrame} frame */
  const sampleOffset = (_layer, frame) =>
    frame.effectAmount > 0.004 ? { yPx: 58 * frame.effectAmount } : {};

  return Object.freeze({
    id: "bang",
    radius: 13,
    cameraZoom: 1.28,
    paint,
    scaleOrder: 3,
    sampleScale,
    offsetOrder: 1,
    sampleOffset,
  });
}

export { create };
