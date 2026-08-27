// @ts-check
/* 口述波形特效。 */

/** @param {{ math: import("../../types.js").MathPort }} dependencies */
function create(dependencies) {
  const { clamp, Rc, y1e } = dependencies.math;
  /** @param {number} now */
  const wave = (now) =>
    0.42 +
    0.29 * Math.sin(now * 0.0021) * Math.sin(now * 0.0034) +
    0.29 * Math.sin(now * 0.0013 + 1.7);

  /** @param {import("./contracts.js").EffectLayer} layer @param {import("./contracts.js").EffectPaintFrame} frame */
  function paint(layer, frame) {
    const slots = [-2, -1, 1, 2];
    const gap = 44;
    for (let index = 0; index < 4; index++) {
      const node = index < 2 ? layer.dots[index] : layer.parts[3 + index];
      if (node === undefined) throw new Error("口述波形节点缺失");
      const slot = slots[index];
      if (slot === undefined) throw new Error("口述波形槽位缺失");
      const delayed = clamp(
        (frame.amount - Math.abs(slot) * 0.1) /
          (1 - Math.abs(slot) * 0.1),
        0,
        1,
      );
      if (delayed <= 0.004) {
        node.style.display = "none";
        continue;
      }
      const enter = y1e(delayed);
      const amplitude =
        wave(frame.now) *
        (0.55 + 0.45 * Math.sin(frame.now * 0.012 - Math.abs(slot) * 1.05));
      const radius =
        (7 + 9 * clamp(amplitude, 0.08, 1)) * Rc(delayed);
      const lift = 6 * clamp(amplitude, 0, 1) * delayed;
      node.style.display = "";
      if (index < 2) {
        const scale = (radius / frame.radius) * 1.02;
        node.setAttribute("d", layer.circlePath);
        node.setAttribute(
          "transform",
          `translate(${(frame.radius + slot * gap * enter).toFixed(1)} ${(frame.radius - lift).toFixed(1)}) scale(${scale.toFixed(4)}) translate(${-frame.radius} ${-frame.radius})`,
        );
        node.setAttribute("opacity", delayed.toFixed(3));
      } else {
        node.setAttribute("cx", (frame.radius + slot * gap * enter).toFixed(1));
        node.setAttribute("cy", (frame.radius - lift).toFixed(1));
        node.setAttribute("r", radius.toFixed(2));
        node.setAttribute("opacity", delayed.toFixed(3));
      }
    }
  }
  return Object.freeze({
    id: "wave",
    radius: 16,
    cameraZoom: 1.42,
    paint,
  });
}

export { create };
