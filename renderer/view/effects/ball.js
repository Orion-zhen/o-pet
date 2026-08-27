// @ts-check
/* 弹球形变。 */

/** @param {{ math: import("../../types.js").MathPort }} _dependencies */
function create(_dependencies) {
  /** @param {import("./contracts.js").EffectLayer} _layer @param {import("./contracts.js").EffectSampleFrame} frame */
  function sampleOffset(_layer, frame) {
    if (frame.effectAmount <= 0.004) return {};
    const seconds = (frame.now - frame.stateAt) / 1000;
    const duration = 0.62;
    const height = 52;
    const gravity = (8 * height) / (duration * duration);
    const initialHeight = 40;
    const riseTime = Math.sqrt((2 * initialHeight) / gravity);
    let elevation;
    if (seconds < riseTime)
      elevation = initialHeight - 0.5 * gravity * seconds * seconds;
    else {
      const cycle = (((seconds - riseTime) / duration) % 1 + 1) % 1;
      elevation = 4 * height * cycle * (1 - cycle);
    }
    return { yPx: (40 - elevation) * frame.effectAmount };
  }

  return Object.freeze({
    id: "ball",
    radius: 18,
    cameraZoom: 1.22,
    offsetOrder: 3,
    sampleOffset,
  });
}

export { create };
