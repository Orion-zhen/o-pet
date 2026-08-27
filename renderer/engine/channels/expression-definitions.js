// @ts-check
/* 可复用脸部姿态控制器定义。 */

/**
 * @typedef {{ globalSec: number, localSec: number, now: number, context: import("../../types.js").ExpressionContext, options: import("../../types.js").ControllerOptions }} FaceInput
 * @typedef {{ restLid: number, eyeScale: number, faceRollDeg: number, eyeLids: [number, number] | null, eyeTarget: [number, number] | null, requestBlink: boolean }} FaceSample
 * @typedef {(input: FaceInput, output: FaceSample) => void} FaceHandler
 * @param {import("../../types.js").MathPort} math
 * @param {import("../../types.js").AnimationTables} tables
 * @returns {Readonly<Record<string, FaceHandler>>}
 */
function create(math, tables) {
  const { clamp, K2 } = math;
  const { EYE_PLAYLIST } = tables;
  /** @type {FaceHandler} */
  const neutral = () => {};
  /** @type {Record<string, FaceHandler>} */
  const definitions = {
    neutral,
    sleeping({ localSec, options }, output) {
      if (EYE_PLAYLIST.sleeping?.includes(options.eyeTo ?? -1)) {
        output.restLid = (options.eyeMorphX ?? 1) > 0.85 ? 1 : 0.08;
      } else if (localSec < 1.2) {
        const close = Math.min(1, localSec);
        output.restLid = Math.max(
          0.08,
          1 - close * (1 + 0.15 * Math.sin(localSec * 6.5)),
        );
      } else {
        output.restLid = 0.08;
        if ((options.blinkX ?? 1) < 0.18) output.eyeTarget = [13, 11];
      }
    },
    dreaming(_input, output) {
      output.restLid = 0.06;
    },
    waking({ localSec, context }, output) {
      if (localSec < 0.5) {
        output.restLid = 0.07;
        output.eyeTarget = [3, 12];
      } else if (localSec < 1.2) {
        output.restLid = 1;
        output.eyeScale = 1.12;
      } else if (localSec < 2.2) {
        output.eyeTarget = [0, 7];
        if (localSec < 1.4 && !context.wakingBlinked) {
          context.wakingBlinked = true;
          output.requestBlink = true;
        }
      } else {
        output.eyeTarget = [0, 7];
      }
    },
    excited(_input, output) {
      output.eyeScale = 1.06;
    },
    surprised({ localSec }, output) {
      const settle = Math.min(localSec / 1.2, 1);
      output.eyeScale = 1.15 - settle * 0.08;
    },
    suspicious(_input, output) {
      output.restLid = 0.85;
    },
    startled({ localSec }, output) {
      const elapsed = clamp(localSec / 0.65, 0, 1);
      output.eyeScale = 1.2 - elapsed * 0.08;
    },
    stretching({ localSec, context }, output) {
      if (localSec < 0.45) {
        const amount = K2(localSec / 0.45);
        output.restLid = 1 - 0.5 * amount;
      } else if (localSec < 2.35) {
        const amount = K2((localSec - 0.45) / 1.9);
        output.restLid = 0.5 + 0.15 * amount;
      } else if (localSec < 2.75) {
        output.restLid = 0.65;
      } else {
        const amount = K2(clamp((localSec - 2.75) / 0.75, 0, 1));
        output.restLid = 0.65 + 0.35 * amount;
        if (amount > 0.42 && !context.stretchBlinked) {
          context.stretchBlinked = true;
          output.requestBlink = true;
        }
      }
    },
    quizzical({ localSec, context, options }, output) {
      const direction = options.direction || 1;
      let amount;
      if (localSec < 0.15) amount = -0.2 * (1 - localSec / 0.15);
      else if (localSec < 0.55) amount = K2((localSec - 0.15) / 0.4);
      else if (localSec < 1.45)
        amount = 1 + 0.2 * K2((localSec - 0.55) / 0.9);
      else amount = 1.2 * (1 - K2(clamp((localSec - 1.45) / 0.75, 0, 1)));
      const bodyAngle = (options.reduceMotion ? 0 : 7.5) * amount;
      const faceAngle = 12 * amount;
      output.faceRollDeg = direction * (faceAngle - bodyAngle);
      output.eyeScale = 1.04;
      output.eyeLids = direction > 0 ? [1, 0.82] : [0.82, 1];
      if (localSec > 1.75 && !context.quizzicalBlinked) {
        context.quizzicalBlinked = true;
        output.requestBlink = true;
      }
    },
    drowsy({ globalSec, now, options }, output) {
      output.restLid = 0.34 + Math.sin(globalSec * 0.8) * 0.07;
      if (!options.slumpAt) return;
      const elapsed = (now - options.slumpAt) / 1000;
      const sinkDuration = 1.7;
      const wakeDuration = 0.3;
      const recoverDuration = 1.5;
      if (elapsed < sinkDuration) {
        const phase = elapsed / sinkDuration;
        const curve = phase * phase;
        output.restLid = 0.34 - curve * (0.34 - 0.04);
      } else if (elapsed < sinkDuration + wakeDuration) {
        const phase = (elapsed - sinkDuration) / wakeDuration;
        const wake = Math.sin(phase * Math.PI);
        output.restLid = 0.04 + wake * 0.42;
      } else if (elapsed < sinkDuration + wakeDuration + recoverDuration) {
        const phase =
          (elapsed - sinkDuration - wakeDuration) / recoverDuration;
        const recover = 1 - Math.pow(1 - phase, 2.2);
        output.restLid = 0.46 + (0.34 - 0.46) * recover;
        if (phase > 0.32 && phase < 0.46) output.restLid = 0.05;
      }
    },
    happy(_input, output) {
      output.eyeScale = 1.05;
    },
    curious(_input, output) {
      output.eyeScale = 1.08;
    },
    confused(_input, output) {
      output.restLid = 0.9;
    },
    bored(_input, output) {
      output.restLid = 0.6;
      output.eyeScale = 0.98;
    },
    proud(_input, output) {
      output.restLid = 0.9;
      output.eyeScale = 1.02;
    },
    shy(_input, output) {
      output.restLid = 0.85;
      output.eyeScale = 0.95;
    },
    sad(_input, output) {
      output.restLid = 0.7;
      output.eyeScale = 0.97;
    },
    laughing(_input, output) {
      output.restLid = 0.7;
    },
    scared(_input, output) {
      output.restLid = 1.05;
      output.eyeScale = 1.12;
    },
    playful(_input, output) {
      output.eyeScale = 1.06;
    },
    celebrate(_input, output) {
      output.restLid = 1.1;
      output.eyeScale = 1.1;
    },
    dragging({ localSec }, output) {
      const phase = (localSec % 3.4) / 3.4;
      if (phase >= 0.12 && phase < 0.62) output.eyeScale = 1.06;
    },
    notifying({ localSec }, output) {
      output.eyeScale = 1 + 0.05 * Math.exp(-localSec * 3);
    },
  };
  return Object.freeze(definitions);
}

export { create };
