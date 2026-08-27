// @ts-check
/* 思考圆点与吸收脉冲。 */

const DOT_R = 22;
const DOT_GAP = 62;
const POP0 = 0.84;
const POP1 = 0.22;

/**
 * @param {{ math: import("../../types.js").MathPort, tables: import("../../types.js").RuntimeTables }} dependencies
 */
function create(dependencies) {
  const { clamp, Rc, y1e, K2 } = dependencies.math;
  const timing = dependencies.tables.THINKING_ALT;

  /** @param {import("./contracts.js").EffectLayer} layer @param {number} now @param {number} slot @param {number} amount @param {boolean} [reduce] @returns {import("./contracts.js").DotPulse} */
  function pulse(layer, now, slot, amount, reduce = false) {
    const phase = ((((now - layer.overlayAt) / 1400 + 0.119) % 1) + 1) % 1;
    let distance = Math.abs(phase - slot / 3);
    distance = Math.min(distance, 1 - distance);
    const peak = reduce
      ? 1
      : Math.exp(-(distance * distance) / (2 * 0.15 * 0.15));
    const motion = reduce ? 0 : 1;
    return {
      lift: peak * 9 * amount * motion,
      pop: 1 + motion * (POP0 + POP1 * peak - 1),
      tone: 1 - motion * 0.5 * (1 - peak),
    };
  }

  /** @param {number} now @param {number} stateAt @param {number} radius @param {number} index */
  function sampleThoughtDot(now, stateAt, radius, index) {
    const start = timing.dotStarts[index];
    const contactRadius = [95, 93, 96][index];
    if (start === undefined || contactRadius === undefined)
      throw new Error(`思考圆点 ${index} 缺少时序数据`);
    const phase = ((((now - stateAt) / timing.cycleMs) % 1) + 1) % 1;
    const localPhase = ((phase - start + 1) % 1) / timing.dotDuration;
    if (localPhase >= 1) return null;
    const approach = K2(clamp(localPhase / timing.absorbAt, 0, 1));
    const absorption = K2(
      clamp(
        (localPhase - timing.absorbAt) / (1 - timing.absorbAt),
        0,
        1,
      ),
    );
    const fusion = K2(
      clamp(
        (localPhase - timing.mergeAt) / (timing.absorbAt - timing.mergeAt),
        0,
        1,
      ),
    );
    const inverse = 1 - approach;
    const startX = radius - 14 + index * 7;
    const controlX = radius - 78 + index * 4;
    const contactAngle = 2.12 - index * 0.1;
    const contactX = radius + Math.cos(contactAngle) * contactRadius;
    const contactY = radius + Math.sin(contactAngle) * contactRadius;
    const absorptionDepth = 28 * absorption;
    return {
      x:
        inverse * inverse * startX +
        2 * inverse * approach * controlX +
        approach * approach * contactX -
        Math.cos(contactAngle) * absorptionDepth,
      y:
        inverse * inverse * (radius + 168) +
        2 * inverse * approach * (radius + 120) +
        approach * approach * contactY -
        Math.sin(contactAngle) * absorptionDepth,
      radius: 2.4 + 10.1 * approach,
      opacity: clamp(localPhase / 0.1, 0, 1),
      bump: {
        angle: contactAngle,
        amount: 8.5 * fusion * (1 - absorption),
        width: 0.24,
      },
    };
  }

  /** @param {import("./contracts.js").EffectLayer} layer @param {import("./contracts.js").EffectPaintFrame} frame */
  function paintDots(layer, frame) {
    const positions = [frame.radius - DOT_GAP, frame.radius + DOT_GAP];
    for (let index = 0; index < 2; index++) {
      const node = layer.dots[index];
      if (node === undefined) throw new Error("思考圆点节点缺失");
      const position = positions[index];
      if (position === undefined) throw new Error("思考圆点位置缺失");
      const delayed = clamp(
        (frame.amount - index * 0.12) / (1 - index * 0.12),
        0,
        1,
      );
      if (delayed <= 0.004) {
        node.style.display = "none";
        continue;
      }
      const eased = Rc(delayed);
      const enter = y1e(delayed);
      const dotPulse = pulse(
        layer,
        frame.now,
        index === 0 ? 0 : 2,
        frame.amount,
        frame.reduce,
      );
      const scale = ((DOT_R * eased * dotPulse.pop) / frame.radius) * 1.02;
      node.style.display = "";
      node.setAttribute("d", layer.circlePath);
      node.setAttribute(
        "transform",
        `translate(${(frame.radius + (position - frame.radius) * enter).toFixed(1)} ${(frame.radius - dotPulse.lift).toFixed(1)}) scale(${scale.toFixed(4)}) translate(${-frame.radius} ${-frame.radius})`,
      );
      node.setAttribute("opacity", (eased * dotPulse.tone).toFixed(3));
    }
  }

  /** @param {import("./contracts.js").EffectLayer} layer @param {import("./contracts.js").EffectPaintFrame} frame */
  function paintThoughtPulse(layer, frame) {
    layer.ensureThoughtDots();
    const amount = Rc(frame.amount);
    if (frame.reduce) {
      for (let index = 0; index < 3; index++) {
        const dot = layer.thoughtDots[index];
        if (dot === undefined) throw new Error("思考吸收圆点节点缺失");
        dot.style.display = "";
        dot.setAttribute("cx", (frame.radius - 18 - index * 13).toFixed(1));
        dot.setAttribute("cy", (frame.radius + 122 - index * 15).toFixed(1));
        dot.setAttribute("r", ((3 + index * 2.5) * amount).toFixed(2));
        dot.setAttribute("opacity", (0.8 * amount).toFixed(3));
      }
      return;
    }
    for (let index = 0; index < timing.dotStarts.length; index++) {
      const dot = layer.thoughtDots[index];
      if (dot === undefined) throw new Error("思考吸收圆点节点缺失");
      const sample = sampleThoughtDot(
        frame.now,
        frame.stateAt,
        frame.radius,
        index,
      );
      if (sample === null) {
        dot.style.display = "none";
        continue;
      }
      dot.style.display = "";
      dot.setAttribute("cx", sample.x.toFixed(1));
      dot.setAttribute("cy", sample.y.toFixed(1));
      dot.setAttribute("r", (sample.radius * amount).toFixed(2));
      dot.setAttribute("opacity", (sample.opacity * amount).toFixed(3));
    }
  }

  /** @param {number} now @param {number} stateAt @param {number} amount @param {number} radius @param {boolean} reduce */
  function thoughtBumps(now, stateAt, amount, radius, reduce) {
    const eased = Rc(amount);
    if (reduce || eased <= 0.004) return [];
    const bumps = [];
    for (let index = 0; index < timing.dotStarts.length; index++) {
      const sample = sampleThoughtDot(now, stateAt, radius, index);
      if (sample !== null && sample.bump.amount > 0.004) {
        bumps.push({ ...sample.bump, amount: sample.bump.amount * eased });
      }
    }
    return bumps;
  }

  /** @param {import("./contracts.js").EffectLayer} layer @param {import("./contracts.js").EffectSampleFrame} frame */
  function sampleDots(layer, frame) {
    const dotPulse = pulse(
      layer,
      frame.now,
      1,
      frame.amount,
      frame.reduce,
    );
    return {
      multiplier:
        1 +
        (dotPulse.pop - 1) *
          (frame.effectAmount / Math.max(frame.amount, 0.001)),
      dotsAmount: frame.effectAmount,
      dotPulse,
    };
  }

  return Object.freeze({
    definitions: Object.freeze([
      Object.freeze({
        id: "dots",
        radius: 22,
        cameraZoom: 1.5,
        paint: paintDots,
        scaleOrder: 0,
        sampleScale: sampleDots,
      }),
      Object.freeze({ id: "thought-pulse", paint: paintThoughtPulse }),
    ]),
    pulse,
    thoughtBumps,
  });
}

export { create };
