// @ts-check
/* 雷达扫描环。 */
import { setAttribute } from "../dom.js";

/** @param {{ math: import("../../types.js").MathPort }} dependencies */
function create(dependencies) {
  const { Rc } = dependencies.math;
  /** @param {import("./contracts.js").EffectLayer} layer @param {import("./contracts.js").EffectPaintFrame} frame */
  function paint(layer, frame) {
    const amount = Rc(frame.amount);
    for (let index = 0; index < 3; index++) {
      const ring = layer.rings[index];
      if (ring === undefined) throw new Error("雷达扫描环节点缺失");
      const phase = (frame.now / 1300 + index / 3) % 1;
      layer.setVisible(ring, true);
      ring.removeAttribute("stroke-dasharray");
      ring.removeAttribute("transform");
      setAttribute(ring, "cx", `${frame.radius}`);
      setAttribute(ring, "cy", `${frame.radius}`);
      setAttribute(ring,
        "r",
        (frame.radiusPx + (104 - frame.radiusPx) * phase).toFixed(1),
      );
      setAttribute(ring, "stroke-width", (3.4 * (1 - phase * 0.55)).toFixed(2));
      setAttribute(ring, "opacity", (amount * (1 - phase) * 0.9).toFixed(3));
    }
  }
  return Object.freeze({
    id: "radar",
    radius: 19,
    cameraZoom: 1.14,
    paint,
  });
}

export { create };
