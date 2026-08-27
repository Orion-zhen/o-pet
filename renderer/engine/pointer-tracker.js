// @ts-check
/* 指针视线跟踪。独立维护目标、边界缓存和平滑后的视线偏移。 */

/**
 * @param {{ math: { clamp(value: number, minimum: number, maximum: number): number, mapPointer(rect: DOMRect | import("../types.js").Bounds, point: import("../types.js").PointerPoint): import("../types.js").PointerPoint, Rn(value: number): number }, bounds: () => DOMRect | import("../types.js").Bounds }} options
 */
function create(options) {
  const { clamp, mapPointer, Rn } = options.math;
  const position = { x: 0, y: 0, tx: 0, ty: 0 };
  /** @type {import("../types.js").PointerPoint | null} */
  let raw = null;
  /** @type {import("../types.js").PointerPoint | null} */
  let target = null;
  /** @type {DOMRect | import("../types.js").Bounds | null} */
  let rectCache = null;
  let rectAt = -1e9;

  /** @param {import("../types.js").PointerPoint | null} point */
  function setRaw(point) {
    raw = point;
  }

  /** @param {import("../types.js").PointerPoint | null} point */
  function setTarget(point) {
    target = point;
  }

  /** @param {number} now @param {string} gazeState */
  function update(now, gazeState) {
    const lockFront = gazeState === "front" || gazeState === "sleeping";
    const source = lockFront ? null : target || raw;
    if (source) {
      if (now - rectAt > 200) {
        rectCache = options.bounds();
        rectAt = now;
      }
      const rect = rectCache;
      if (rect && rect.width > 0) {
        const mapped = target ? source : mapPointer(rect, source);
        position.tx =
          clamp(
            (mapped.x - (rect.left + rect.width / 2)) / rect.width,
            -0.6,
            0.6,
          ) * 22;
        position.ty =
          clamp(
            (mapped.y - (rect.top + rect.height / 2)) / rect.height,
            -0.6,
            0.6,
          ) * 14;
      }
    } else {
      position.tx = 0;
      position.ty = 0;
    }
    const smoothing = Rn(0.16);
    position.x += (position.tx - position.x) * smoothing;
    position.y += (position.ty - position.y) * smoothing;
  }

  return Object.freeze({
    position: () => position,
    raw: () => raw,
    setRaw,
    setTarget,
    target: () => target,
    update,
  });
}

export { create };
