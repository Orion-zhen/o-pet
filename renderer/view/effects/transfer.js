// @ts-check
/* 发送、接收和上传传输特效。 */

const SEND_MS = 1500;
const RECEIVE_MS = 1700;

/** @param {{ math: import("../../types.js").MathPort }} dependencies */
function create(dependencies) {
  const { clamp, Rc } = dependencies.math;

  /** @param {import("./contracts.js").EffectLayer} layer @param {import("./contracts.js").EffectPaintFrame} frame */
  function paintSend(layer, frame) {
    const amount = Rc(frame.amount);
    const cycle = ((((frame.now - frame.stateAt) / SEND_MS) % 1) + 1) % 1;
    const progress = clamp((cycle - 0.18) / 0.55, 0, 1);
    const eased = progress * progress * (0.4 + 0.6 * progress);
    const dx = 0.74;
    const dy = -0.62;
    const distance = 108 * eased;
    const primary = layer.parts[5];
    const primaryOn = progress > 0 && progress < 1;
    if (primary === undefined) throw new Error("发送粒子节点缺失");
    primary.style.display = primaryOn ? "" : "none";
    if (primaryOn) {
      primary.setAttribute("cx", (frame.radius + dx * distance).toFixed(1));
      primary.setAttribute("cy", (frame.radius + dy * distance).toFixed(1));
      primary.setAttribute("r", (10 * (1 - eased * 0.55) * amount).toFixed(2));
      primary.setAttribute("opacity", (amount * (1 - eased * eased)).toFixed(3));
    }
    const secondary = layer.parts[6];
    if (secondary === undefined) throw new Error("发送尾迹节点缺失");
    const secondaryProgress = clamp((cycle - 0.26) / 0.55, 0, 1);
    const secondaryEased =
      secondaryProgress * secondaryProgress * (0.4 + 0.6 * secondaryProgress);
    const secondaryOn =
      progress > 0 && secondaryProgress > 0 && secondaryProgress < 1;
    secondary.style.display = secondaryOn ? "" : "none";
    if (secondaryOn) {
      const secondaryDistance = 108 * secondaryEased;
      secondary.setAttribute(
        "cx",
        (frame.radius + dx * secondaryDistance).toFixed(1),
      );
      secondary.setAttribute(
        "cy",
        (frame.radius + dy * secondaryDistance).toFixed(1),
      );
      secondary.setAttribute(
        "r",
        (5 * (1 - secondaryEased * 0.6) * amount).toFixed(2),
      );
      secondary.setAttribute(
        "opacity",
        (amount * 0.3 * (1 - secondaryEased)).toFixed(3),
      );
    }
    const ring = layer.rings[5];
    if (ring === undefined) throw new Error("发送波纹节点缺失");
    const ringProgress = clamp((cycle - 0.18) / 0.3, 0, 1);
    const ringOn = ringProgress > 0 && ringProgress < 1;
    ring.style.display = ringOn ? "" : "none";
    if (ringOn) {
      ring.removeAttribute("stroke-dasharray");
      ring.removeAttribute("transform");
      ring.setAttribute("cx", `${frame.radius}`);
      ring.setAttribute("cy", `${frame.radius}`);
      ring.setAttribute("r", (20 + 34 * Rc(ringProgress)).toFixed(1));
      ring.setAttribute("stroke-width", (2.8 * (1 - ringProgress)).toFixed(2));
      ring.setAttribute(
        "opacity",
        (amount * (1 - ringProgress) * 0.8).toFixed(3),
      );
    }
  }

  /** @param {import("./contracts.js").EffectLayer} layer @param {import("./contracts.js").EffectPaintFrame} frame */
  function paintReceive(layer, frame) {
    const amount = Rc(frame.amount);
    const elapsed = frame.now - frame.stateAt;
    const tick = Math.floor(elapsed / RECEIVE_MS);
    if (tick !== layer.recvTick) {
      layer.recvTick = tick;
      layer.recvDir = layer.rand(-Math.PI * 1.25, Math.PI * 0.25);
    }
    const cycle = (((elapsed / RECEIVE_MS) % 1) + 1) % 1;
    const progress = clamp(cycle / 0.6, 0, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const dx = Math.cos(layer.recvDir);
    const dy = Math.sin(layer.recvDir);
    const distance = 108 * (1 - eased);
    const particle = layer.parts[5];
    if (particle === undefined) throw new Error("接收粒子节点缺失");
    const particleOn = progress < 1;
    particle.style.display = particleOn ? "" : "none";
    if (particleOn) {
      const curve = 18 * Math.sin(progress * Math.PI) * (1 - eased * 0.7);
      particle.setAttribute(
        "cx",
        (frame.radius + dx * distance + -dy * curve).toFixed(1),
      );
      particle.setAttribute(
        "cy",
        (frame.radius + dy * distance + dx * curve).toFixed(1),
      );
      particle.setAttribute("r", (3.5 + 6.5 * eased).toFixed(2));
      particle.setAttribute(
        "opacity",
        (
          amount *
          clamp(progress * 3.5, 0, 1) *
          (0.3 + 0.7 * eased)
        ).toFixed(3),
      );
    }
    const ring = layer.rings[6];
    if (ring === undefined) throw new Error("接收波纹节点缺失");
    const ringProgress = clamp((cycle - 0.58) / 0.32, 0, 1);
    const ringOn = ringProgress > 0 && ringProgress < 1;
    ring.style.display = ringOn ? "" : "none";
    if (ringOn) {
      ring.removeAttribute("stroke-dasharray");
      ring.removeAttribute("transform");
      ring.setAttribute("cx", `${frame.radius}`);
      ring.setAttribute("cy", `${frame.radius}`);
      ring.setAttribute("r", (20 + 26 * Rc(ringProgress)).toFixed(1));
      ring.setAttribute("stroke-width", (2.8 * (1 - ringProgress)).toFixed(2));
      ring.setAttribute(
        "opacity",
        (amount * (1 - ringProgress) * 0.8).toFixed(3),
      );
    }
  }

  /** @param {import("./contracts.js").EffectLayer} layer @param {import("./contracts.js").EffectPaintFrame} frame */
  function paintDock(layer, frame) {
    const amount = Rc(frame.amount);
    const elapsed = (frame.now - frame.stateAt) / 1000;
    const orbitRadius = 42;
    const speed = 1.1;
    for (let index = 0; index < 2; index++) {
      const node = layer.parts[5 + index];
      if (node === undefined) throw new Error("上传对接粒子节点缺失");
      const progress = clamp((elapsed - (0.2 + index * 1.3)) / 0.9, 0, 1);
      if (progress <= 0) {
        node.style.display = "none";
        continue;
      }
      const eased = 1 - Math.pow(1 - progress, 3);
      const phase = frame.now * 0.001 * speed + index * Math.PI;
      const targetX = frame.radius + orbitRadius * Math.sin(phase);
      const targetY =
        frame.radius +
        orbitRadius * 0.5 * Math.cos(phase) +
        Math.sin(frame.now * 0.003 + index) * 2;
      const startX = frame.radius - 120 + index * 30;
      const startY = frame.radius + 95;
      node.style.display = "";
      node.setAttribute("cx", (startX + (targetX - startX) * eased).toFixed(1));
      node.setAttribute("cy", (startY + (targetY - startY) * eased).toFixed(1));
      node.setAttribute("r", ((7 + 3 * eased) * amount).toFixed(2));
      node.setAttribute(
        "opacity",
        (amount * clamp(progress * 4, 0, 1)).toFixed(3),
      );
    }
  }

  /** @param {import("./contracts.js").EffectLayer} _layer @param {import("./contracts.js").EffectSampleFrame} frame */
  function sampleSend(_layer, frame) {
    if (frame.effectAmount <= 0.004) return { multiplier: 1 };
    const cycle = ((((frame.now - frame.stateAt) / SEND_MS) % 1) + 1) % 1;
    const contract =
      cycle < 0.18 ? -0.06 * Math.sin((cycle / 0.18) * Math.PI) : 0;
    const release =
      cycle >= 0.18 && cycle < 0.42
        ? 0.05 * Math.sin(((cycle - 0.18) / 0.24) * Math.PI)
        : 0;
    return {
      multiplier: 1 + (contract + release) * frame.effectAmount,
    };
  }

  /** @param {import("./contracts.js").EffectLayer} _layer @param {import("./contracts.js").EffectSampleFrame} frame */
  function sampleReceive(_layer, frame) {
    if (frame.effectAmount <= 0.004) return { multiplier: 1 };
    const cycle =
      ((((frame.now - frame.stateAt) / RECEIVE_MS) % 1) + 1) % 1;
    const progress = clamp((cycle - 0.58) / 0.34, 0, 1);
    return {
      multiplier:
        1 +
        0.11 * Math.sin(progress * Math.PI) * frame.effectAmount,
    };
  }

  return Object.freeze([
    Object.freeze({
      id: "send",
      radius: 20,
      cameraZoom: 1.12,
      paint: paintSend,
      scaleOrder: 2,
      sampleScale: sampleSend,
    }),
    Object.freeze({
      id: "receive",
      radius: 20,
      cameraZoom: 1.12,
      paint: paintReceive,
      scaleOrder: 1,
      sampleScale: sampleReceive,
    }),
    Object.freeze({ id: "dock", radius: 20, cameraZoom: 1.3, paint: paintDock }),
  ]);
}

export { create, RECEIVE_MS, SEND_MS };
