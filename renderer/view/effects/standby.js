// @ts-check
/* 待机收束特效。 */
import { setAttribute } from "../dom.js";

/** @param {{ math: import("../../types.js").MathPort }} dependencies */
function create(dependencies) {
  const { Rc } = dependencies.math;
  /** @param {import("./contracts.js").EffectLayer} layer @param {import("./contracts.js").EffectPaintFrame} frame */
  function paint(layer, frame) {
    const amount = Rc(frame.amount);
    const node = layer.parts[4];
    if (node === undefined) throw new Error("待机光点节点缺失");
    const pulse = 0.5 + 0.5 * Math.sin(frame.now * 0.0016);
    layer.setVisible(node, true);
    setAttribute(node, "cx", `${frame.radius}`);
    setAttribute(node, "cy", `${frame.radius}`);
    setAttribute(node, "r", (26 + 7 * pulse).toFixed(1));
    setAttribute(node,
      "opacity",
      (amount * (0.06 + 0.1 * pulse)).toFixed(3),
    );
    const ring = layer.rings[2];
    if (ring === undefined) throw new Error("待机收束环节点缺失");
    const show = frame.amount < 0.995;
    layer.setVisible(ring, show);
    if (show) {
      ring.removeAttribute("stroke-dasharray");
      ring.removeAttribute("transform");
      setAttribute(ring, "cx", `${frame.radius}`);
      setAttribute(ring, "cy", `${frame.radius}`);
      setAttribute(ring, "r", (104 - 88 * amount).toFixed(1));
      setAttribute(ring, "stroke-width", "2.4");
      setAttribute(ring, "opacity", ((1 - amount) * 0.5).toFixed(3));
    }
  }
  /** @param {import("./contracts.js").EffectLayer} _layer @param {import("./contracts.js").EffectSampleFrame} frame */
  const sampleOpacity = (_layer, frame) =>
    frame.effectAmount > 0
      ? (0.28 + 0.2 * Math.sin(frame.now * 0.0016)) * frame.effectAmount
      : 0;

  return Object.freeze({
    id: "standby",
    radius: 13,
    cameraZoom: 1.75,
    paint,
    sampleOpacity,
  });
}

export { create };
