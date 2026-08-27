// @ts-check
/* 可复用身体运动控制器定义。 */

/**
 * @typedef {{ globalSec: number, localSec: number, now: number, context: import("../../types.js").MotionContext, options: import("../../types.js").ControllerOptions }} MotionInput
 * @typedef {{ rollDeg: number, xPx: number, yPx: number, squashX: number, squashY: number, yVelocity: number, rollVelocity: number, spin: [number, number] | null, requestBlink: boolean, deformation: import("../../types.js").BodyDeformation | null }} MotionSample
 * @typedef {(input: MotionInput, output: MotionSample) => void} MotionHandler
 * @param {import("../../types.js").MathPort} math
 * @param {{ THINKING_ALT: { absorbAt: number, cycleMs: number, dotDuration: number, dotStarts: readonly number[] } }} tables
 * @returns {Readonly<Record<string, MotionHandler>>}
 */
function create(math, tables) {
  const { clamp, rand, sign, K2 } = math;
  const { absorbAt, cycleMs, dotDuration, dotStarts } = tables.THINKING_ALT;
  const restRollDeg = 0;
  /** @type {MotionHandler} */
  const neutral = () => {};
  /** @type {Record<string, MotionHandler>} */
  const definitions = {
    neutral,
    sleeping(input, output) {
      const settle = Math.min(input.localSec / 2, 1);
      const arrival = Math.sin(clamp(input.localSec / 0.5, 0, 1) * Math.PI);
      output.rollDeg = restRollDeg + 4 * settle + Math.sin(input.globalSec * 0.25) * 2;
      output.xPx = -2 * settle;
      output.yPx = 8 * settle + Math.sin(input.globalSec * 0.55) * 3 - arrival * 5;
      output.squashY = 1 + Math.sin(input.globalSec * 0.55) * 0.016 + arrival * 0.05;
      if (input.now >= input.context.sleepTwitchAt) {
        input.context.sleepTwitchEnd = input.now + 420;
        input.context.sleepTwitchAt = input.now + rand(18_000, 34_000);
      }
      if (input.now < input.context.sleepTwitchEnd && !input.options.reduceMotion) {
        const twitch = 1 - (input.context.sleepTwitchEnd - input.now) / 420;
        output.yPx -= Math.sin(twitch * Math.PI) * 2.5;
        output.rollDeg += Math.sin(twitch * Math.PI * 2) * 1.8;
      }
    },
    dreaming(input, output) {
      const variant = input.options.variant || "float";
      const breath = Math.sin(input.globalSec * 0.48);
      output.rollDeg = restRollDeg + 4 + Math.sin(input.globalSec * 0.22) * 1.4;
      output.yPx = 8 + breath * 2;
      output.squashY = 1 + breath * 0.014;
      if (!input.options.reduceMotion) {
        if (variant === "float") {
          const drift = Math.sin(clamp(input.localSec / 8, 0, 1) * Math.PI);
          output.yPx -= drift * 7;
          output.squashY += drift * 0.018;
        } else if (variant === "curl") {
          const settle = K2(clamp(input.localSec / 2.2, 0, 1));
          output.rollDeg += (input.options.direction || 1) * settle * 5;
          output.xPx += (input.options.direction || 1) * settle * 4;
          output.squashY -= settle * 0.018;
        } else if (
          variant === "twitch" &&
          input.localSec > 3.2 &&
          input.localSec < 3.75
        ) {
          const twitch = (input.localSec - 3.2) / 0.55;
          output.yPx -= Math.sin(twitch * Math.PI) * 5;
          output.rollDeg += Math.sin(twitch * Math.PI * 2) * 2;
        }
      }
    },
    waking(input, output) {
      if (input.localSec < 0.5) {
        output.yPx = 6;
      } else if (input.localSec < 1.2) {
        output.yPx = -5;
        output.xPx = 0;
        output.rollDeg = restRollDeg;
        output.squashY = 1.04;
      } else if (input.localSec < 2.2) {
        output.yPx = 0;
        output.squashY = 1;
      } else {
        const settle = Math.min((input.localSec - 2.2) / 0.8, 1);
        output.rollDeg =
          restRollDeg + Math.sin(settle * Math.PI * 3) * 6 * (1 - settle);
        output.yPx = Math.sin(input.globalSec * 0.9) * 2;
      }
    },
    idle(input, output) {
      if (input.now >= input.context.idleShiftAt) {
        input.context.idleShiftDirection = sign();
        input.context.idleShiftDuration = rand(900, 1700);
        input.context.idleShiftEnd = input.now + input.context.idleShiftDuration;
        input.context.idleShiftAt = input.now + rand(7000, 15_000);
      }
      const breathing = Math.sin(
        input.globalSec * 0.78 + Math.sin(input.globalSec * 0.09) * 0.45,
      );
      let shift = 0;
      if (input.now < input.context.idleShiftEnd) {
        const elapsed =
          1 - (input.context.idleShiftEnd - input.now) / input.context.idleShiftDuration;
        shift =
          Math.sin(clamp(elapsed, 0, 1) * Math.PI) *
          input.context.idleShiftDirection;
      }
      output.rollDeg =
        restRollDeg + Math.sin(input.globalSec * 0.31) * 0.8 + shift * 1.8;
      output.xPx = Math.sin(input.globalSec * 0.19) * 0.7 + shift * 2.2;
      output.yPx = breathing * 1.1;
      output.squashY =
        1 + breathing * (0.006 + 0.002 * Math.sin(input.globalSec * 0.07));
    },
    listening(input, output) {
      output.rollDeg = restRollDeg + 8 + Math.sin(input.globalSec * 0.5) * 1.5;
      output.xPx = 2;
      output.yPx = -2 + Math.sin(input.globalSec * 0.8) * 0.8;
      output.squashY = 1.015;
      if (input.now >= input.context.nodUntil) {
        input.context.nodUntil = input.now + rand(1800, 3200);
        input.context.nodEnd = input.now + 380;
      }
      if (input.now < input.context.nodEnd) {
        const nod = 1 - (input.context.nodEnd - input.now) / 380;
        output.yPx += Math.sin(nod * Math.PI) * 4.5;
        output.rollDeg += Math.sin(nod * Math.PI) * 2;
      }
    },
    replyPreparing(input, output) {
      const progress = clamp(input.localSec / 0.6, 0, 1);
      const inhale = Math.sin(progress * Math.PI);
      output.yPx = -3.5 * inhale;
      output.squashX = 1 - 0.025 * inhale;
      output.squashY = 1 + 0.055 * inhale;
    },
    replyClosing(input, output) {
      const progress = clamp(input.localSec / 0.28, 0, 1);
      const gather = Math.sin(progress * Math.PI);
      output.yPx = 2.5 * gather;
      output.squashX = 1 + 0.035 * gather;
      output.squashY = 1 - 0.07 * gather;
    },
    thinking(input, output) {
      output.rollDeg = restRollDeg - 9 + Math.sin(input.globalSec * 0.35) * 5;
      output.xPx = Math.sin(input.globalSec * 0.3) * 5;
      output.yPx = Math.sin(input.globalSec * 0.6) * 2.5;
    },
    "thinking-alt"(input, output) {
      const cycleSec = cycleMs / 1000;
      const phase = ((input.localSec / cycleSec) % 1 + 1) % 1;
      const breath = Math.sin((input.localSec * Math.PI * 2) / 3.1);
      let stretch = 0;
      let recoil = 0;
      for (const start of dotStarts) {
        const impact = (start + dotDuration * absorbAt) % 1;
        const untilImpact = ((impact - phase + 1) % 1) * cycleSec;
        if (untilImpact < 0.18) {
          stretch += Math.sin(
            (1 - untilImpact / 0.18) * (Math.PI / 2),
          );
        }
        const impactAge = ((phase - impact + 1) % 1) * cycleSec;
        if (impactAge < 0.28) {
          recoil +=
            Math.exp(-impactAge * 8) * Math.sin(impactAge * 30);
        }
      }
      stretch = clamp(stretch, 0, 1.15);
      recoil = clamp(recoil, -0.65, 1);
      output.yPx = -10 - breath * 3.2 + stretch * 4.2 - recoil * 5.5;
      output.squashX =
        0.9 * (1 - breath * 0.026 - stretch * 0.024 + recoil * 0.045);
      output.squashY =
        0.9 * (1 + breath * 0.052 + stretch * 0.095 - recoil * 0.11);
      if (!input.options.reduceMotion) {
        output.deformation = {
          waveAmount: 1.1 + breath * 0.55,
          wavePhase: (input.localSec * Math.PI * 2) / 5.6,
          bumps: [],
        };
      }
    },
    searching(input, output) {
      const scan = Math.sin(input.globalSec * 1.3);
      output.rollDeg = restRollDeg + scan * 13;
      output.xPx = scan * 7;
      output.yPx = Math.sin(input.globalSec * 1.7) * 3;
      if (input.now >= input.context.stAt) {
        output.spin = [1, sign()];
        input.context.stAt = input.now + rand(4000, 7000);
      }
    },
    working(input, output) {
      const stroke = Math.sin(input.globalSec * Math.PI * 2 * 1.6);
      output.rollDeg = restRollDeg + 4 + stroke * 2.5;
      output.xPx = 3;
      output.yPx = 1.5 + Math.max(0, stroke) * 3;
      output.squashY = 1 - Math.max(0, stroke) * 0.02;
      const ambientSpin = input.options.allowAmbientSpin !== false;
      if (input.now >= input.context.stAt && ambientSpin) {
        output.spin = [1, 1];
        input.context.stAt = input.now + rand(6000, 9000);
      }
    },
    excited(input, output) {
      const cycle = (input.globalSec * 2.2) % 1;
      const jump = Math.sin(cycle * Math.PI);
      output.yPx = -jump * 10 + 2;
      output.squashY = cycle < 0.1 ? 0.92 : cycle < 0.3 ? 1.05 : 1;
      output.xPx = Math.sin(input.globalSec * 1.1) * 4;
      output.rollDeg = restRollDeg + Math.sin(input.globalSec * Math.PI * 2 * 1.1) * 7;
      if (input.now >= input.context.stAt) {
        output.spin = [1, sign()];
        input.context.stAt = input.now + rand(2800, 5000);
      }
    },
    surprised(input, output) {
      const settle = Math.min(input.localSec / 1.2, 1);
      output.xPx = -4 * (1 - settle);
      output.yPx = -8 * (1 - settle);
      output.squashY = input.localSec < 0.2 ? 1.08 : 1;
      output.rollDeg = restRollDeg + Math.sin(input.globalSec * 11) * 1.5 * (1 - settle);
    },
    suspicious(input, output) {
      output.rollDeg = restRollDeg - 6 + Math.sin(input.globalSec * 0.3) * 3;
      output.xPx = Math.sin(input.globalSec * 0.25) * -4;
      output.yPx = 1 + Math.sin(input.globalSec * 0.45) * 1.2;
      if (input.now >= input.context.impulseAt) {
        output.rollVelocity = 30;
        input.context.impulseAt = input.now + rand(4000, 7000);
      }
    },
    angry(input, output) {
      if (input.now >= input.context.impulseAt) {
        input.context.angryShakeUntil = input.now + 420;
        output.yVelocity = 70;
        input.context.impulseAt = input.now + rand(1800, 3200);
      }
      output.rollDeg =
        restRollDeg +
        (input.now < input.context.angryShakeUntil ? Math.sin(input.now * 0.05) * 4.5 : 0);
      output.yPx = 3.5;
      output.squashY = 0.975;
    },
    startled(input, output) {
      const direction = input.options.direction || 1;
      const elapsed = clamp(input.localSec / 0.65, 0, 1);
      if (input.options.reduceMotion) return;
      if (elapsed < 0.16) {
        const amount = K2(elapsed / 0.16);
        output.xPx = direction * 10 * amount;
        output.yPx = 4 * amount;
        output.rollDeg = direction * 5 * amount;
        output.squashY = 1 - 0.12 * amount;
      } else if (elapsed < 0.48) {
        const amount = K2((elapsed - 0.16) / 0.32);
        output.xPx = direction * (10 - 13 * amount);
        output.yPx = 4 - 8 * amount;
        output.rollDeg = direction * (5 - 7 * amount);
        output.squashY = 0.88 + 0.18 * amount;
      } else {
        const amount = (elapsed - 0.48) / 0.52;
        const settle = 1 - amount;
        output.xPx = direction * Math.sin(amount * Math.PI * 3) * 2.5 * settle;
        output.yPx = -4 * settle;
        output.rollDeg = direction * Math.sin(amount * Math.PI * 3) * 1.5 * settle;
        output.squashY = 1 + Math.sin(amount * Math.PI * 2) * 0.025 * settle;
      }
    },
    stretching(input, output) {
      const direction = input.options.direction || 1;
      if (input.localSec < 0.45) {
        const amount = K2(input.localSec / 0.45);
        output.yPx = 5 * amount;
        output.squashY = 1 - 0.08 * amount;
      } else if (input.localSec < 2.35) {
        const amount = K2((input.localSec - 0.45) / 1.9);
        output.yPx = 5 - 9 * amount;
        output.rollDeg = direction * 8 * amount;
        output.squashY = 0.92 + 0.23 * amount;
      } else if (input.localSec < 2.75) {
        const amount = (input.localSec - 2.35) / 0.4;
        output.yPx = -4;
        output.rollDeg =
          direction *
          (8 +
            Math.sin(amount * Math.PI * 6) *
              (input.options.reduceMotion ? 0 : 0.7));
        output.squashY = 1.15;
      } else {
        const amount = K2(clamp((input.localSec - 2.75) / 0.75, 0, 1));
        output.yPx = -4 * (1 - amount);
        output.rollDeg = direction * 8 * (1 - amount);
        output.squashY = 1.15 - 0.15 * amount;
      }
      if (input.options.reduceMotion) {
        output.rollDeg = 0;
        output.yPx = 0;
        output.squashY = 1;
      }
    },
    quizzical(input, output) {
      const direction = input.options.direction || 1;
      let amount;
      if (input.localSec < 0.15) amount = -0.2 * (1 - input.localSec / 0.15);
      else if (input.localSec < 0.55) amount = K2((input.localSec - 0.15) / 0.4);
      else if (input.localSec < 1.45)
        amount = 1 + 0.2 * K2((input.localSec - 0.55) / 0.9);
      else amount = 1.2 * (1 - K2(clamp((input.localSec - 1.45) / 0.75, 0, 1)));
      output.rollDeg = direction * (input.options.reduceMotion ? 0 : 7.5) * amount;
      output.xPx = input.options.reduceMotion ? 0 : direction * 1.5 * amount;
      output.yPx = input.options.reduceMotion ? 0 : 1.5 * amount;
    },
    touched(input, output) {
      const direction = input.options.direction || 1;
      const press = K2(clamp(input.localSec / 0.16, 0, 1));
      output.rollDeg = direction * 3 * press;
      output.xPx = direction * 2.5 * press;
      output.yPx = 3 * press;
      output.squashX = 1 + 0.045 * press;
      output.squashY = 1 - 0.085 * press;
    },
    booped(input, output) {
      const direction = input.options.direction || 1;
      const progress = clamp(input.localSec / 0.42, 0, 1);
      const recoil = Math.sin(progress * Math.PI) * (1 - progress * 0.35);
      output.rollDeg = -direction * 5 * recoil;
      output.xPx = -direction * 5 * recoil;
      output.yPx = -4 * recoil;
      output.squashX = 1 - 0.035 * recoil;
      output.squashY = 1 + 0.075 * recoil;
    },
    petting(input, output) {
      const direction = input.options.direction || 1;
      const settle = K2(clamp(input.localSec / 0.7, 0, 1));
      const breathing = Math.sin(input.globalSec * 0.9);
      output.rollDeg = direction * 7 * settle + breathing * 0.8;
      output.xPx = direction * 4 * settle;
      output.yPx = 2 * settle + breathing * 0.8;
      output.squashY = 1 - 0.025 * settle + breathing * 0.006;
    },
    drowsy(input, output) {
      output.rollDeg = restRollDeg + Math.sin(input.globalSec * 0.32) * 2.5;
      output.xPx = Math.sin(input.globalSec * 0.2) * 1.5;
      output.yPx = 6 + Math.sin(input.globalSec * 0.36) * 2.2;
      output.squashY = 1 + Math.sin(input.globalSec * 0.36) * 0.022;
      if (input.now >= input.context.nodUntil && !input.context.slumpAt)
        input.context.slumpAt = input.now;
      if (input.context.slumpAt) {
        const elapsed = (input.now - input.context.slumpAt) / 1000;
        const sinkDuration = 1.7;
        const wakeDuration = 0.3;
        const recoverDuration = 1.5;
        if (elapsed < sinkDuration) {
          const phase = elapsed / sinkDuration;
          const curve = phase * phase;
          const wobble =
            Math.sin(phase * Math.PI * 2.5) * 2.2 * (1 - phase);
          output.yPx = 6 + curve * 19 + wobble;
          output.rollDeg = restRollDeg + curve * 10;
          output.squashY = 1 - curve * 0.045;
        } else if (elapsed < sinkDuration + wakeDuration) {
          const phase = (elapsed - sinkDuration) / wakeDuration;
          const wake = Math.sin(phase * Math.PI);
          output.yPx = 25 - wake * 7;
          output.rollDeg = restRollDeg + 10 - wake * 4;
        } else if (
          elapsed <
          sinkDuration + wakeDuration + recoverDuration
        ) {
          const phase =
            (elapsed - sinkDuration - wakeDuration) / recoverDuration;
          const recover = 1 - Math.pow(1 - phase, 2.2);
          output.yPx = 25 - 19 * recover;
          output.rollDeg = restRollDeg + 10 * (1 - recover);
        } else {
          input.context.slumpAt = 0;
          input.context.nodUntil = input.now + rand(12_000, 24_000);
        }
      }
    },
    happy(input, output) {
      const bounce = Math.sin(input.globalSec * 2.4);
      output.rollDeg = restRollDeg + Math.sin(input.globalSec * 1.2) * 3;
      output.xPx = Math.sin(input.globalSec * 1.1) * 2.5;
      output.yPx = -Math.abs(bounce) * 3;
      output.squashY = 1 + bounce * 0.02;
    },
    curious(input, output) {
      output.rollDeg = restRollDeg + 10 + Math.sin(input.globalSec * 0.7) * 6;
      output.xPx = Math.sin(input.globalSec * 0.6) * 5;
      output.yPx = -2 + Math.sin(input.globalSec * 0.9) * 1.5;
      output.squashY = 1.01;
      if (input.now >= input.context.nodUntil) {
        input.context.nodUntil = input.now + rand(1600, 2800);
        input.context.nodEnd = input.now + 440;
      }
      if (input.now < input.context.nodEnd) {
        const nod = 1 - (input.context.nodEnd - input.now) / 440;
        output.xPx += Math.sin(nod * Math.PI) * 8;
        output.rollDeg += Math.sin(nod * Math.PI) * 5;
      }
    },
    stashingLight(input, output) {
      const direction = input.options.direction || 1;
      const approach = K2(clamp(input.localSec / 0.9, 0, 1));
      const absorption = clamp((input.localSec - 1.05) / 0.5, 0, 1);
      const recoil = Math.sin(absorption * Math.PI);
      output.rollDeg = direction * (7 * approach - 5 * recoil);
      output.xPx = direction * (6 * approach - 8 * recoil);
      output.yPx = -2 * approach + 3 * recoil;
      output.squashX = 1 + 0.055 * recoil;
      output.squashY = 1 - 0.09 * recoil;
    },
    confused(input, output) {
      const sway = Math.sin(input.globalSec * 0.8);
      output.rollDeg = restRollDeg + sway * 12;
      output.xPx = sway * 3;
      output.yPx = Math.sin(input.globalSec * 0.5) * 2;
      if (input.now >= input.context.impulseAt) {
        output.rollVelocity = 22;
        input.context.impulseAt = input.now + rand(2600, 4200);
      }
    },
    bored(input, output) {
      output.rollDeg = restRollDeg - 3 + Math.sin(input.globalSec * 0.25) * 4;
      output.xPx = Math.sin(input.globalSec * 0.2) * 4;
      output.yPx = 5 + Math.sin(input.globalSec * 0.35) * 1.5;
      output.squashY = 0.99;
      if (input.now >= input.context.impulseAt) {
        input.context.nodEnd = input.now + 600;
        input.context.impulseAt = input.now + rand(4000, 7000);
      }
      if (input.now < input.context.nodEnd) {
        const nod = 1 - (input.context.nodEnd - input.now) / 600;
        output.squashY = 1 + Math.sin(nod * Math.PI) * 0.05;
        output.yPx += Math.sin(nod * Math.PI) * 3;
      }
    },
    proud(input, output) {
      output.rollDeg = restRollDeg + Math.sin(input.globalSec * 0.4) * 2.5;
      output.xPx = Math.sin(input.globalSec * 0.35) * 2;
      output.yPx = -4 + Math.sin(input.globalSec * 0.6);
      output.squashY = 1.03;
    },
    shy(input, output) {
      output.rollDeg = restRollDeg - 8 + Math.sin(input.globalSec * 0.5) * 3;
      output.xPx = -3 + Math.sin(input.globalSec * 0.4) * 2;
      output.yPx = 3;
      output.squashY = 0.98;
    },
    sad(input, output) {
      output.rollDeg = restRollDeg + 3 + Math.sin(input.globalSec * 0.3) * 2;
      output.xPx = Math.sin(input.globalSec * 0.25) * 1.5;
      output.yPx = 7 + Math.sin(input.globalSec * 0.4);
      output.squashY = 0.97;
    },
    laughing(input, output) {
      const laugh = Math.sin(input.globalSec * Math.PI * 2 * 3.2);
      output.rollDeg = restRollDeg + laugh * 4;
      output.xPx = Math.sin(input.globalSec * 2) * 2;
      output.yPx = -Math.abs(laugh) * 5;
      output.squashY = 1 + laugh * 0.03;
    },
    scared(input, output) {
      output.rollDeg = restRollDeg + Math.sin(input.now * 0.04) * 2;
      output.xPx = -2 + Math.sin(input.now * 0.05) * 1.5;
      output.yPx = 2 + Math.sin(input.globalSec * 1.5);
      output.squashY = 0.97;
    },
    playful(input, output) {
      output.rollDeg = restRollDeg + Math.sin(input.globalSec * 1.4) * 8;
      output.xPx = Math.sin(input.globalSec * 1.1) * 4;
      output.yPx = -Math.abs(Math.sin(input.globalSec * 2.2)) * 3;
      output.squashY = 1 + Math.sin(input.globalSec * 2.2) * 0.015;
    },
    celebrate(input, output) {
      output.yPx = -Math.abs(Math.sin(input.globalSec * 1.6)) * 2.5;
    },
    dragging(input, output) {
      const phase = (input.localSec % 3.4) / 3.4;
      if (phase < 0.12) {
        output.xPx = -16;
        output.yPx = -22;
        output.rollDeg = restRollDeg - 5;
      } else if (phase < 0.62) {
        const amount = (phase - 0.12) / 0.5;
        output.xPx = -16 + 32 * K2(amount);
        output.yPx = -22 + Math.sin(input.globalSec * 1.4) * 2;
        output.rollDeg = restRollDeg + Math.sin(input.globalSec * 2.6) * 6;
      } else {
        const cycle = Math.floor(input.localSec / 3.4);
        if (cycle !== input.context.dragCycle) {
          input.context.dragCycle = cycle;
          output.yVelocity = 90;
        }
        output.xPx = 16;
      }
    },
    humming(input, output) {
      output.rollDeg = restRollDeg + Math.sin(input.globalSec * 0.4) * 2;
      output.xPx = Math.sin(input.globalSec * 0.3) * 1.5;
      output.yPx = Math.sin(input.globalSec * 0.7) * 1.5;
    },
    notifying(input, output) {
      if (!input.context.notifyPop && input.localSec > 0.12) {
        input.context.notifyPop = true;
        output.requestBlink = true;
        output.yVelocity = -26;
      }
      output.rollDeg = restRollDeg + 3;
      output.xPx = 2;
      output.yPx = -1;
    },
  };
  return Object.freeze(definitions);
}

export { create };
