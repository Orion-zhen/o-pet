// @ts-check
/* 环绕粒子特效。 */

/** @param {{ math: import("../../types.js").MathPort }} dependencies */
function create(dependencies) {
  const { clamp, Rc, y1e } = dependencies.math;
  /** @param {import("./contracts.js").EffectLayer} layer @param {import("./contracts.js").EffectPaintFrame} frame */
  function paint(layer, frame) {
    const opacity = Rc(frame.amount);
    const orbitRadius = 52 * y1e(frame.amount);
    const particleRadius = 12;
    const phase = frame.now * 0.0017;
    for (let index = 0; index < 5; index++) {
      const node = layer.parts[index];
      if (node === undefined) throw new Error("环绕粒子节点缺失");
      const angle = phase + (index * Math.PI * 2) / 5;
      const depth = Math.cos(angle);
      const scale = 0.5 + 0.5 * clamp(depth, 0, 1);
      node.style.display = "";
      node.setAttribute(
        "cx",
        (frame.radius + orbitRadius * Math.sin(angle)).toFixed(1),
      );
      node.setAttribute(
        "cy",
        (frame.radius - orbitRadius * 0.42 * Math.cos(angle)).toFixed(1),
      );
      node.setAttribute(
        "r",
        Math.max(particleRadius * scale * opacity, 0.3).toFixed(2),
      );
      node.setAttribute(
        "opacity",
        (clamp((depth + 0.4) / 0.6, 0.18, 1) * opacity).toFixed(3),
      );
    }
  }
  return Object.freeze({
    id: "orbit",
    radius: 19,
    cameraZoom: 1.14,
    paint,
  });
}

export { create };
