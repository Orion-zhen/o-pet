// @ts-check
/* 生成聚集粒子。 */

const CYCLE_ON = 2000;

/** @param {{ math: import("../../types.js").MathPort }} dependencies */
function create(dependencies) {
  const { clamp, Rc } = dependencies.math;
  /** @param {import("./contracts.js").EffectLayer} layer @param {import("./contracts.js").EffectPaintFrame} frame */
  function paint(layer, frame) {
    const amount = Rc(frame.amount);
    for (let index = 0; index < 5; index++) {
      const node = layer.parts[index];
      if (node === undefined) throw new Error("聚集粒子节点缺失");
      const elapsed = clamp(
        ((frame.now - layer.overlayAt) / CYCLE_ON - index * 0.09) / 0.62,
        0,
        1,
      );
      if (elapsed >= 1) {
        node.style.display = "none";
        continue;
      }
      const eased = 1 - Math.pow(1 - elapsed, 3);
      const angle = index * 2.4 + elapsed * 2.2;
      const distance = 96 * (1 - eased);
      node.style.display = "";
      node.setAttribute(
        "cx",
        (frame.radius + distance * Math.cos(angle)).toFixed(1),
      );
      node.setAttribute(
        "cy",
        (frame.radius + distance * Math.sin(angle) * 0.8).toFixed(1),
      );
      node.setAttribute("r", (9 * (0.5 + 0.5 * eased) * amount).toFixed(2));
      node.setAttribute(
        "opacity",
        (amount * clamp(elapsed * 5, 0, 1) * (1 - eased * 0.25)).toFixed(3),
      );
    }
  }
  return Object.freeze({
    id: "gather",
    radius: 19,
    cameraZoom: 1.15,
    cycleOn: CYCLE_ON,
    paint,
  });
}

export { create };
