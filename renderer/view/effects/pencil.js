// @ts-check
/* 铅笔形变、书写轨迹和姿态采样。 */

const DURATION_MS = 2500;

/** @param {number} now @param {number} stateAt @param {import("../../types.js").MathPort} math */
function pose(now, stateAt, math) {
  const { clamp, K2 } = math;
  const elapsed = now - stateAt;
  const cycle = (((elapsed / DURATION_MS) % 1) + 1) % 1;
  if (cycle < 0.68) {
    const progress = cycle / 0.68;
    const eased = progress * progress * (3 - 2 * progress);
    const active =
      clamp(progress / 0.08, 0, 1) * clamp((1 - progress) / 0.08, 0, 1);
    return {
      x: -54 + 118 * eased,
      y: 26,
      wig: Math.sin(progress * 24) * 3.2 * active,
      rot: 17 + Math.sin(elapsed * 6e-4) * 1,
      lift: false,
    };
  }
  const eased = K2((cycle - 0.68) / 0.32);
  return {
    x: 64 - 118 * eased,
    y: 26 - 20 * Math.sin(eased * Math.PI),
    wig: 0,
    rot:
      17 -
      2 * Math.sin(eased * Math.PI) +
      Math.sin(elapsed * 6e-4) * 1,
    lift: true,
  };
}

/** @param {Array<[number, number]>} points */
function smoothLine(points) {
  const first = points[0];
  if (first === undefined) throw new Error("铅笔轨迹不能为空");
  let path = `M${first[0].toFixed(1)} ${first[1].toFixed(1)}`;
  const second = points[1];
  if (points.length === 2 && second !== undefined)
    return path + `L${second[0].toFixed(1)} ${second[1].toFixed(1)}`;
  for (let index = 0; index < points.length - 1; index++) {
    const previous = points[Math.max(index - 1, 0)];
    const current = points[index];
    const next = points[index + 1];
    const following = points[Math.min(index + 2, points.length - 1)];
    if (
      previous === undefined ||
      current === undefined ||
      next === undefined ||
      following === undefined
    )
      throw new Error("铅笔轨迹缺少控制点");
    path += `C${(current[0] + (next[0] - previous[0]) / 6).toFixed(1)} ${(current[1] + (next[1] - previous[1]) / 6).toFixed(1)} ${(next[0] - (following[0] - current[0]) / 6).toFixed(1)} ${(next[1] - (following[1] - current[1]) / 6).toFixed(1)} ${next[0].toFixed(1)} ${next[1].toFixed(1)}`;
  }
  return path;
}

/** @param {{ math: import("../../types.js").MathPort }} dependencies */
function create(dependencies) {
  const { clamp, Rc } = dependencies.math;
  /** @param {import("./contracts.js").EffectLayer} layer @param {import("./contracts.js").EffectPaintFrame} frame */
  function paint(layer, frame) {
    const pencil = pose(frame.now, frame.stateAt, dependencies.math);
    const glyph = layer.glyphs[0];
    if (glyph === undefined) throw new Error("铅笔图形节点缺失");
    const angle = ((pencil.rot - 90) * Math.PI) / 180;
    const length = 68;
    const dx = Math.cos(angle) * length;
    const dy = Math.sin(angle) * length;
    glyph.style.display = "";
    glyph.setAttribute("d", layer.pencilPath);
    glyph.style.fill = "var(--fg)";
    glyph.setAttribute(
      "transform",
      `translate(${(frame.radius + (pencil.x + dx) * frame.amount).toFixed(1)} ${(frame.radius + (pencil.y + pencil.wig * 0.15 + dy) * frame.amount).toFixed(1)}) rotate(${(pencil.rot * frame.amount).toFixed(1)}) scale(${Rc(frame.amount).toFixed(3)}) translate(${-frame.radius} ${-frame.radius})`,
    );
    glyph.setAttribute(
      "opacity",
      clamp(frame.amount * 1.6 - 0.3, 0, 1).toFixed(3),
    );
    if (frame.amount > 0.6 && !pencil.lift) {
      const x = frame.radius + pencil.x;
      const y = frame.radius + pencil.y + pencil.wig + 19;
      const last = layer.ink[layer.ink.length - 1];
      if (last === undefined || Math.hypot(x - last[0], y - last[1]) > 2.4) {
        layer.ink.push([x, y]);
        if (layer.ink.length > 64) layer.ink.shift();
      } else {
        last[0] = x;
        last[1] = y;
      }
    } else if (layer.ink.length) {
      layer.ink.splice(0, 2);
    }
    const line = layer.glyphs[1];
    if (line === undefined) throw new Error("铅笔轨迹节点缺失");
    if (layer.ink.length < 2) {
      line.style.display = "none";
    } else {
      line.style.display = "";
      line.style.fill = "none";
      line.style.stroke = "var(--fg)";
      line.setAttribute("stroke-width", "6");
      line.setAttribute("stroke-linecap", "round");
      line.setAttribute("stroke-linejoin", "round");
      line.setAttribute("d", smoothLine(layer.ink));
      line.setAttribute(
        "opacity",
        clamp(frame.amount * 1.2, 0, 1).toFixed(3),
      );
    }
  }

  /** @param {import("./contracts.js").EffectLayer} _layer @param {import("./contracts.js").EffectSampleFrame} frame */
  function sampleOffset(_layer, frame) {
    if (frame.effectAmount <= 0.004) return {};
    const pencil = pose(frame.now, frame.stateAt, dependencies.math);
    return {
      xPx: pencil.x * frame.effectAmount,
      yPx: (pencil.y + pencil.wig * 0.5) * frame.effectAmount,
      rollDeg: pencil.rot * frame.effectAmount,
    };
  }

  return Object.freeze({
    id: "pencil",
    radius: 17,
    cameraZoom: 1.18,
    usesInk: true,
    paint,
    offsetOrder: 0,
    sampleOffset,
  });
}

export { create, pose };
