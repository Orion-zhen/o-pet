// @ts-check
/* 有限动画序列。序列只安排场景与一次性动作，不包含几何公式。 */
import * as steps from "./timeline-steps.js";

/**
 * @param {typeof import("./presets.js")} presets
 */
function create(presets) {
  const S = presets.scenes;
  const cues = Object.freeze({
    engage: steps.sequence(
      steps.scene(S.listening, 350),
      steps.scene(S.curious, 650),
    ),
    reply_sent: steps.sequence(
      steps.scene(S.replyClosing, 280, { preserveEffect: true }),
      steps.scene(S.sending, 850),
    ),
    approval_granted: steps.sequence(
      steps.scene(S.happy, 900, { preserveEffect: true }),
    ),
    approval_denied: steps.sequence(
      steps.scene(S.shy, 900, { preserveEffect: true }),
    ),
    error_first: steps.sequence(
      steps.scene(S.surprised, 650, { preserveEffect: true }),
    ),
    error_repeated: steps.sequence(
      steps.scene(S.confused, 1200, { preserveEffect: true }),
    ),
    error_stubborn: steps.sequence(
      steps.scene(S.angry, 1400, { preserveEffect: true }),
    ),
    completed_quick: steps.sequence(
      steps.scene(S.quickHappy, 900, { events: [steps.wink()] }),
      steps.scene(S.notifying, 5000),
    ),
    completed_normal: steps.sequence(
      steps.scene(S.proud, 1500),
      steps.scene(S.notifying, 5000),
    ),
    completed_hard: steps.sequence(
      steps.scene(S.celebrate, 2500),
      steps.scene(S.notifying, 5000),
    ),
    run_failed: steps.sequence(
      steps.scene(S.sad, 1800),
      steps.scene(S.notifying, 5000),
    ),
    run_aborted: steps.sequence(steps.scene(S.surprised, 600)),
  });

  /** @param {number} direction */
  const fullWake = (direction) =>
    steps.sequence(
      steps.scene(
        presets.withDetails(S.stretching, { direction }),
        3500,
      ),
      steps.scene(S.playful, 700),
      steps.scene(S.happy, 900),
    );

  /** @param {number} direction */
  const tapPlay = (direction) =>
    steps.sequence(
      steps.scene(
        presets.withDetails(S.playful, { direction }),
        1200,
      ),
      steps.scene(S.quickHappy, 700, { events: [steps.wink()] }),
    );

  return Object.freeze({ cues, fullWake, tapPlay });
}

export { create };
