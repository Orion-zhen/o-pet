// @ts-check
/* 有限动画序列。序列只安排场景与一次性动作，不包含几何公式。 */
/**
 * @param {typeof import("./presets.js")} presets
 */
function create(presets) {
  const S = presets.scenes;
  /**
   * @param {import("../types.js").Scene} scene
   * @param {number} duration
   * @param {Omit<import("../types.js").TimelineStep, "scene" | "duration">} [options]
   * @returns {Readonly<import("../types.js").TimelineStep>}
   */
  const step = (scene, duration, options = {}) =>
    Object.freeze({ scene, duration, ...options });
  /** @param {...Readonly<import("../types.js").TimelineStep>} steps */
  const sequence = (...steps) => Object.freeze(steps);

  const cues = Object.freeze({
    engage: sequence(step(S.listening, 350), step(S.curious, 650)),
    reply_sent: sequence(step(S.sending, 850)),
    approval_granted: sequence(step(S.happy, 900, { preserveEffect: true })),
    approval_denied: sequence(step(S.shy, 900, { preserveEffect: true })),
    error_first: sequence(step(S.surprised, 650, { preserveEffect: true })),
    error_repeated: sequence(
      step(S.confused, 1200, { preserveEffect: true }),
    ),
    error_stubborn: sequence(step(S.angry, 1400, { preserveEffect: true })),
    completed_quick: sequence(
      step(S.quickHappy, 900, { wink: true }),
      step(S.notifying, 5000),
    ),
    completed_normal: sequence(step(S.proud, 1500), step(S.notifying, 5000)),
    completed_hard: sequence(
      step(S.celebrate, 2500),
      step(S.notifying, 5000),
    ),
    run_failed: sequence(step(S.sad, 1800), step(S.notifying, 5000)),
    run_aborted: sequence(step(S.surprised, 600)),
  });

  /** @param {number} direction */
  const fullWake = (direction) =>
    sequence(
      step(presets.withDetails(S.stretching, { direction }), 3500),
      step(S.playful, 700),
      step(S.happy, 900),
    );

  return Object.freeze({ cues, fullWake });
}

export { create };
