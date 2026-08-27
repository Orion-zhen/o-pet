// @ts-check
/* 空闲时发现并藏起光点的装饰特效。 */

/** @param {{ math: import("../../types.js").MathPort }} dependencies */
function create(dependencies) {
  const { clamp, K2, Rc } = dependencies.math;

  /** @param {import("./contracts.js").EffectLayer} layer @param {import("./contracts.js").EffectPaintFrame} frame */
  function paint(layer, frame) {
    const elapsed = frame.now - frame.stateAt;
    const direction = frame.direction || 1;
    const amount = Rc(frame.amount);
    const dot = layer.parts[5];
    const ring = layer.rings[5];
    if (dot === undefined || ring === undefined)
      throw new Error("藏光点装饰节点缺失");

    const absorption = clamp((elapsed - 1650) / 420, 0, 1);
    const dotVisible = elapsed < 2070;
    dot.style.display = dotVisible ? "" : "none";
    if (dotVisible) {
      const approach = frame.reduce
        ? 0
        : K2(clamp((elapsed - 650) / 1200, 0, 1));
      const inverse = 1 - approach;
      const startX = frame.radius + direction * 108;
      const startY = frame.radius - 60;
      const controlX = frame.radius + direction * 112;
      const controlY = frame.radius + 18;
      const endX = frame.radius + direction * 32;
      const endY = frame.radius - 8;
      const x =
        inverse * inverse * startX +
        2 * inverse * approach * controlX +
        approach * approach * endX;
      const y =
        inverse * inverse * startY +
        2 * inverse * approach * controlY +
        approach * approach * endY;
      const appear = clamp(elapsed / 260, 0, 1);
      const hover = frame.reduce ? 0 : Math.sin(elapsed * 0.009) * 2.5;
      dot.setAttribute("cx", x.toFixed(1));
      dot.setAttribute("cy", (y + hover).toFixed(1));
      dot.setAttribute("r", (7.5 * amount * (1 - absorption)).toFixed(2));
      dot.setAttribute(
        "opacity",
        (amount * appear * (1 - absorption)).toFixed(3),
      );
    }

    const pulse = clamp((elapsed - 1880) / 820, 0, 1);
    const pulseVisible = pulse > 0 && pulse < 1;
    ring.style.display = pulseVisible ? "" : "none";
    if (pulseVisible) {
      const eased = frame.reduce ? 0.5 : K2(pulse);
      ring.removeAttribute("stroke-dasharray");
      ring.removeAttribute("transform");
      ring.setAttribute("cx", `${frame.radius}`);
      ring.setAttribute("cy", `${frame.radius}`);
      ring.setAttribute("r", (76 + 33 * eased).toFixed(1));
      ring.setAttribute("stroke-width", (3.2 * (1 - pulse)).toFixed(2));
      ring.setAttribute(
        "opacity",
        (amount * (1 - pulse) * 0.72).toFixed(3),
      );
    }
  }

  return Object.freeze({ id: "stashed-light", paint });
}

export { create };
