// @ts-check
/* 待机收束特效。 */

/** @param {{ math: import("../../types.js").MathPort }} dependencies */
function create(dependencies) {
  const { Rc } = dependencies.math;
  /** @param {import("./contracts.js").EffectLayer} layer @param {import("./contracts.js").EffectPaintFrame} frame */
  function paint(layer, frame) {
    const amount = Rc(frame.amount);
    const node = layer.parts[4];
    if (node === undefined) throw new Error("待机光点节点缺失");
    const pulse = 0.5 + 0.5 * Math.sin(frame.now * 0.0016);
    node.style.display = "";
    node.setAttribute("cx", `${frame.radius}`);
    node.setAttribute("cy", `${frame.radius}`);
    node.setAttribute("r", (26 + 7 * pulse).toFixed(1));
    node.setAttribute(
      "opacity",
      (amount * (0.06 + 0.1 * pulse)).toFixed(3),
    );
    const ring = layer.rings[2];
    if (ring === undefined) throw new Error("待机收束环节点缺失");
    const show = frame.amount < 0.995;
    ring.style.display = show ? "" : "none";
    if (show) {
      ring.removeAttribute("stroke-dasharray");
      ring.removeAttribute("transform");
      ring.setAttribute("cx", `${frame.radius}`);
      ring.setAttribute("cy", `${frame.radius}`);
      ring.setAttribute("r", (104 - 88 * amount).toFixed(1));
      ring.setAttribute("stroke-width", "2.4");
      ring.setAttribute("opacity", ((1 - amount) * 0.5).toFixed(3));
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
