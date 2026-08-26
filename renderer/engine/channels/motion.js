/* 身体运动控制器。只计算身体目标和身体瞬态动作，不决定眼形、视线或特效。 */
(function (g) {
  function create(math, tables) {
    const { clamp, rand, sign, K2 } = math;
    const { absorbAt, cycleMs, dotDuration, dotStarts } =
      tables.THINKING_ALT;

    function sample(state, globalSec, localSec, now, context, options = {}) {
      const restRollDeg = 0;
      let rollDeg = restRollDeg;
      let xPx = 0;
      let yPx = 0;
      let squashX = 1;
      let squashY = 1;
      let yVelocity = 0;
      let rollVelocity = 0;
      let spin = null;
      let requestBlink = false;
      let deformation = null;

      switch (state) {
        case "sleeping": {
          const settle = Math.min(localSec / 2, 1);
          const arrival = Math.sin(clamp(localSec / 0.5, 0, 1) * Math.PI);
          rollDeg = restRollDeg + 4 * settle + Math.sin(globalSec * 0.25) * 2;
          xPx = -2 * settle;
          yPx = 8 * settle + Math.sin(globalSec * 0.55) * 3 - arrival * 5;
          squashY = 1 + Math.sin(globalSec * 0.55) * 0.016 + arrival * 0.05;
          if (now >= context.sleepTwitchAt) {
            context.sleepTwitchEnd = now + 420;
            context.sleepTwitchAt = now + rand(18_000, 34_000);
          }
          if (now < context.sleepTwitchEnd && !options.reduceMotion) {
            const twitch = 1 - (context.sleepTwitchEnd - now) / 420;
            yPx -= Math.sin(twitch * Math.PI) * 2.5;
            rollDeg += Math.sin(twitch * Math.PI * 2) * 1.8;
          }
          break;
        }
        case "dreaming": {
          const variant = options.variant || "float";
          const breath = Math.sin(globalSec * 0.48);
          rollDeg = restRollDeg + 4 + Math.sin(globalSec * 0.22) * 1.4;
          yPx = 8 + breath * 2;
          squashY = 1 + breath * 0.014;
          if (!options.reduceMotion) {
            if (variant === "float") {
              const drift = Math.sin(clamp(localSec / 8, 0, 1) * Math.PI);
              yPx -= drift * 7;
              squashY += drift * 0.018;
            } else if (variant === "curl") {
              const settle = K2(clamp(localSec / 2.2, 0, 1));
              rollDeg += (options.direction || 1) * settle * 5;
              xPx += (options.direction || 1) * settle * 4;
              squashY -= settle * 0.018;
            } else if (
              variant === "twitch" &&
              localSec > 3.2 &&
              localSec < 3.75
            ) {
              const twitch = (localSec - 3.2) / 0.55;
              yPx -= Math.sin(twitch * Math.PI) * 5;
              rollDeg += Math.sin(twitch * Math.PI * 2) * 2;
            }
          }
          break;
        }
        case "waking":
          if (localSec < 0.5) {
            yPx = 6;
          } else if (localSec < 1.2) {
            yPx = -5;
            xPx = 0;
            rollDeg = restRollDeg;
            squashY = 1.04;
          } else if (localSec < 2.2) {
            yPx = 0;
            squashY = 1;
          } else {
            const settle = Math.min((localSec - 2.2) / 0.8, 1);
            rollDeg =
              restRollDeg + Math.sin(settle * Math.PI * 3) * 6 * (1 - settle);
            yPx = Math.sin(globalSec * 0.9) * 2;
          }
          break;
        case "idle": {
          if (now >= context.idleShiftAt) {
            context.idleShiftDirection = sign();
            context.idleShiftDuration = rand(900, 1700);
            context.idleShiftEnd = now + context.idleShiftDuration;
            context.idleShiftAt = now + rand(7000, 15_000);
          }
          const breathing = Math.sin(
            globalSec * 0.78 + Math.sin(globalSec * 0.09) * 0.45,
          );
          let shift = 0;
          if (now < context.idleShiftEnd) {
            const elapsed =
              1 - (context.idleShiftEnd - now) / context.idleShiftDuration;
            shift =
              Math.sin(clamp(elapsed, 0, 1) * Math.PI) *
              context.idleShiftDirection;
          }
          rollDeg =
            restRollDeg + Math.sin(globalSec * 0.31) * 0.8 + shift * 1.8;
          xPx = Math.sin(globalSec * 0.19) * 0.7 + shift * 2.2;
          yPx = breathing * 1.1;
          squashY =
            1 + breathing * (0.006 + 0.002 * Math.sin(globalSec * 0.07));
          break;
        }
        case "listening":
          rollDeg = restRollDeg + 8 + Math.sin(globalSec * 0.5) * 1.5;
          xPx = 2;
          yPx = -2 + Math.sin(globalSec * 0.8) * 0.8;
          squashY = 1.015;
          if (now >= context.nodUntil) {
            context.nodUntil = now + rand(1800, 3200);
            context.nodEnd = now + 380;
          }
          if (now < context.nodEnd) {
            const nod = 1 - (context.nodEnd - now) / 380;
            yPx += Math.sin(nod * Math.PI) * 4.5;
            rollDeg += Math.sin(nod * Math.PI) * 2;
          }
          break;
        case "thinking":
          rollDeg = restRollDeg - 9 + Math.sin(globalSec * 0.35) * 5;
          xPx = Math.sin(globalSec * 0.3) * 5;
          yPx = Math.sin(globalSec * 0.6) * 2.5;
          break;
        case "thinking-alt": {
          const cycleSec = cycleMs / 1000;
          const phase = ((localSec / cycleSec) % 1 + 1) % 1;
          const breath = Math.sin((localSec * Math.PI * 2) / 3.1);
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
          yPx = -10 - breath * 3.2 + stretch * 4.2 - recoil * 5.5;
          squashX =
            0.9 * (1 - breath * 0.026 - stretch * 0.024 + recoil * 0.045);
          squashY =
            0.9 * (1 + breath * 0.052 + stretch * 0.095 - recoil * 0.11);
          if (!options.reduceMotion) {
            deformation = {
              waveAmount: 1.1 + breath * 0.55,
              wavePhase: (localSec * Math.PI * 2) / 5.6,
              bumps: [],
            };
          }
          break;
        }
        case "searching": {
          const scan = Math.sin(globalSec * 1.3);
          rollDeg = restRollDeg + scan * 13;
          xPx = scan * 7;
          yPx = Math.sin(globalSec * 1.7) * 3;
          if (now >= context.stAt) {
            spin = [1, sign()];
            context.stAt = now + rand(4000, 7000);
          }
          break;
        }
        case "working": {
          const stroke = Math.sin(globalSec * Math.PI * 2 * 1.6);
          rollDeg = restRollDeg + 4 + stroke * 2.5;
          xPx = 3;
          yPx = 1.5 + Math.max(0, stroke) * 3;
          squashY = 1 - Math.max(0, stroke) * 0.02;
          const ambientSpin = options.allowAmbientSpin !== false;
          if (now >= context.stAt && ambientSpin) {
            spin = [1, 1];
            context.stAt = now + rand(6000, 9000);
          }
          break;
        }
        case "excited": {
          const cycle = (globalSec * 2.2) % 1;
          const jump = Math.sin(cycle * Math.PI);
          yPx = -jump * 10 + 2;
          squashY = cycle < 0.1 ? 0.92 : cycle < 0.3 ? 1.05 : 1;
          xPx = Math.sin(globalSec * 1.1) * 4;
          rollDeg = restRollDeg + Math.sin(globalSec * Math.PI * 2 * 1.1) * 7;
          if (now >= context.stAt) {
            spin = [1, sign()];
            context.stAt = now + rand(2800, 5000);
          }
          break;
        }
        case "surprised": {
          const settle = Math.min(localSec / 1.2, 1);
          xPx = -4 * (1 - settle);
          yPx = -8 * (1 - settle);
          squashY = localSec < 0.2 ? 1.08 : 1;
          rollDeg = restRollDeg + Math.sin(globalSec * 11) * 1.5 * (1 - settle);
          break;
        }
        case "suspicious":
          rollDeg = restRollDeg - 6 + Math.sin(globalSec * 0.3) * 3;
          xPx = Math.sin(globalSec * 0.25) * -4;
          yPx = 1 + Math.sin(globalSec * 0.45) * 1.2;
          if (now >= context.impulseAt) {
            rollVelocity = 30;
            context.impulseAt = now + rand(4000, 7000);
          }
          break;
        case "angry":
          if (now >= context.impulseAt) {
            context.angryShakeUntil = now + 420;
            yVelocity = 70;
            context.impulseAt = now + rand(1800, 3200);
          }
          rollDeg =
            restRollDeg +
            (now < context.angryShakeUntil ? Math.sin(now * 0.05) * 4.5 : 0);
          yPx = 3.5;
          squashY = 0.975;
          break;
        case "startled": {
          const direction = options.direction || 1;
          const elapsed = clamp(localSec / 0.65, 0, 1);
          if (options.reduceMotion) break;
          if (elapsed < 0.16) {
            const amount = K2(elapsed / 0.16);
            xPx = direction * 10 * amount;
            yPx = 4 * amount;
            rollDeg = direction * 5 * amount;
            squashY = 1 - 0.12 * amount;
          } else if (elapsed < 0.48) {
            const amount = K2((elapsed - 0.16) / 0.32);
            xPx = direction * (10 - 13 * amount);
            yPx = 4 - 8 * amount;
            rollDeg = direction * (5 - 7 * amount);
            squashY = 0.88 + 0.18 * amount;
          } else {
            const amount = (elapsed - 0.48) / 0.52;
            const settle = 1 - amount;
            xPx = direction * Math.sin(amount * Math.PI * 3) * 2.5 * settle;
            yPx = -4 * settle;
            rollDeg = direction * Math.sin(amount * Math.PI * 3) * 1.5 * settle;
            squashY = 1 + Math.sin(amount * Math.PI * 2) * 0.025 * settle;
          }
          break;
        }
        case "stretching": {
          const direction = options.direction || 1;
          if (localSec < 0.45) {
            const amount = K2(localSec / 0.45);
            yPx = 5 * amount;
            squashY = 1 - 0.055 * amount;
          } else if (localSec < 2.35) {
            const amount = K2((localSec - 0.45) / 1.9);
            yPx = 5 - 9 * amount;
            rollDeg = direction * 8 * amount;
            squashY = 0.945 + 0.16 * amount;
          } else if (localSec < 2.75) {
            const amount = (localSec - 2.35) / 0.4;
            yPx = -4;
            rollDeg =
              direction *
              (8 +
                Math.sin(amount * Math.PI * 6) *
                  (options.reduceMotion ? 0 : 0.7));
            squashY = 1.105;
          } else {
            const amount = K2(clamp((localSec - 2.75) / 0.75, 0, 1));
            yPx = -4 * (1 - amount);
            rollDeg = direction * 8 * (1 - amount);
            squashY = 1.105 - 0.105 * amount;
          }
          if (options.reduceMotion) {
            rollDeg = 0;
            yPx = 0;
            squashY = 1;
          }
          break;
        }
        case "quizzical": {
          const direction = options.direction || 1;
          let amount;
          if (localSec < 0.15) amount = -0.2 * (1 - localSec / 0.15);
          else if (localSec < 0.55) amount = K2((localSec - 0.15) / 0.4);
          else if (localSec < 1.45)
            amount = 1 + 0.2 * K2((localSec - 0.55) / 0.9);
          else amount = 1.2 * (1 - K2(clamp((localSec - 1.45) / 0.75, 0, 1)));
          rollDeg = direction * (options.reduceMotion ? 0 : 7.5) * amount;
          xPx = options.reduceMotion ? 0 : direction * 1.5 * amount;
          yPx = options.reduceMotion ? 0 : 1.5 * amount;
          break;
        }
        case "drowsy": {
          rollDeg = restRollDeg + Math.sin(globalSec * 0.32) * 2.5;
          xPx = Math.sin(globalSec * 0.2) * 1.5;
          yPx = 6 + Math.sin(globalSec * 0.36) * 2.2;
          squashY = 1 + Math.sin(globalSec * 0.36) * 0.022;
          if (now >= context.nodUntil && !context.slumpAt)
            context.slumpAt = now;
          if (context.slumpAt) {
            const elapsed = (now - context.slumpAt) / 1000;
            const sinkDuration = 1.7;
            const wakeDuration = 0.3;
            const recoverDuration = 1.5;
            if (elapsed < sinkDuration) {
              const phase = elapsed / sinkDuration;
              const curve = phase * phase;
              const wobble =
                Math.sin(phase * Math.PI * 2.5) * 2.2 * (1 - phase);
              yPx = 6 + curve * 19 + wobble;
              rollDeg = restRollDeg + curve * 10;
              squashY = 1 - curve * 0.045;
            } else if (elapsed < sinkDuration + wakeDuration) {
              const phase = (elapsed - sinkDuration) / wakeDuration;
              const wake = Math.sin(phase * Math.PI);
              yPx = 25 - wake * 7;
              rollDeg = restRollDeg + 10 - wake * 4;
            } else if (
              elapsed <
              sinkDuration + wakeDuration + recoverDuration
            ) {
              const phase =
                (elapsed - sinkDuration - wakeDuration) / recoverDuration;
              const recover = 1 - Math.pow(1 - phase, 2.2);
              yPx = 25 - 19 * recover;
              rollDeg = restRollDeg + 10 * (1 - recover);
            } else {
              context.slumpAt = 0;
              context.nodUntil = now + rand(12_000, 24_000);
            }
          }
          break;
        }
        case "happy": {
          const bounce = Math.sin(globalSec * 2.4);
          rollDeg = restRollDeg + Math.sin(globalSec * 1.2) * 3;
          xPx = Math.sin(globalSec * 1.1) * 2.5;
          yPx = -Math.abs(bounce) * 3;
          squashY = 1 + bounce * 0.02;
          break;
        }
        case "curious":
          rollDeg = restRollDeg + 10 + Math.sin(globalSec * 0.7) * 6;
          xPx = Math.sin(globalSec * 0.6) * 5;
          yPx = -2 + Math.sin(globalSec * 0.9) * 1.5;
          squashY = 1.01;
          if (now >= context.nodUntil) {
            context.nodUntil = now + rand(1600, 2800);
            context.nodEnd = now + 440;
          }
          if (now < context.nodEnd) {
            const nod = 1 - (context.nodEnd - now) / 440;
            xPx += Math.sin(nod * Math.PI) * 8;
            rollDeg += Math.sin(nod * Math.PI) * 5;
          }
          break;
        case "confused": {
          const sway = Math.sin(globalSec * 0.8);
          rollDeg = restRollDeg + sway * 12;
          xPx = sway * 3;
          yPx = Math.sin(globalSec * 0.5) * 2;
          if (now >= context.impulseAt) {
            rollVelocity = 22;
            context.impulseAt = now + rand(2600, 4200);
          }
          break;
        }
        case "bored":
          rollDeg = restRollDeg - 3 + Math.sin(globalSec * 0.25) * 4;
          xPx = Math.sin(globalSec * 0.2) * 4;
          yPx = 5 + Math.sin(globalSec * 0.35) * 1.5;
          squashY = 0.99;
          if (now >= context.impulseAt) {
            context.nodEnd = now + 600;
            context.impulseAt = now + rand(4000, 7000);
          }
          if (now < context.nodEnd) {
            const nod = 1 - (context.nodEnd - now) / 600;
            squashY = 1 + Math.sin(nod * Math.PI) * 0.05;
            yPx += Math.sin(nod * Math.PI) * 3;
          }
          break;
        case "proud":
          rollDeg = restRollDeg + Math.sin(globalSec * 0.4) * 2.5;
          xPx = Math.sin(globalSec * 0.35) * 2;
          yPx = -4 + Math.sin(globalSec * 0.6);
          squashY = 1.03;
          break;
        case "shy":
          rollDeg = restRollDeg - 8 + Math.sin(globalSec * 0.5) * 3;
          xPx = -3 + Math.sin(globalSec * 0.4) * 2;
          yPx = 3;
          squashY = 0.98;
          break;
        case "sad":
          rollDeg = restRollDeg + 3 + Math.sin(globalSec * 0.3) * 2;
          xPx = Math.sin(globalSec * 0.25) * 1.5;
          yPx = 7 + Math.sin(globalSec * 0.4);
          squashY = 0.97;
          break;
        case "laughing": {
          const laugh = Math.sin(globalSec * Math.PI * 2 * 3.2);
          rollDeg = restRollDeg + laugh * 4;
          xPx = Math.sin(globalSec * 2) * 2;
          yPx = -Math.abs(laugh) * 5;
          squashY = 1 + laugh * 0.03;
          break;
        }
        case "scared":
          rollDeg = restRollDeg + Math.sin(now * 0.04) * 2;
          xPx = -2 + Math.sin(now * 0.05) * 1.5;
          yPx = 2 + Math.sin(globalSec * 1.5);
          squashY = 0.97;
          break;
        case "playful":
          rollDeg = restRollDeg + Math.sin(globalSec * 1.4) * 8;
          xPx = Math.sin(globalSec * 1.1) * 4;
          yPx = -Math.abs(Math.sin(globalSec * 2.2)) * 3;
          squashY = 1 + Math.sin(globalSec * 2.2) * 0.015;
          break;
        case "celebrate":
          yPx = -Math.abs(Math.sin(globalSec * 1.6)) * 2.5;
          break;
        case "dragging": {
          const phase = (localSec % 3.4) / 3.4;
          if (phase < 0.12) {
            xPx = -16;
            yPx = -22;
            rollDeg = restRollDeg - 5;
          } else if (phase < 0.62) {
            const amount = (phase - 0.12) / 0.5;
            xPx = -16 + 32 * K2(amount);
            yPx = -22 + Math.sin(globalSec * 1.4) * 2;
            rollDeg = restRollDeg + Math.sin(globalSec * 2.6) * 6;
          } else {
            const cycle = Math.floor(localSec / 3.4);
            if (cycle !== context.dragCycle) {
              context.dragCycle = cycle;
              yVelocity = 90;
            }
            xPx = 16;
          }
          break;
        }
        case "humming":
          rollDeg = restRollDeg + Math.sin(globalSec * 0.4) * 2;
          xPx = Math.sin(globalSec * 0.3) * 1.5;
          yPx = Math.sin(globalSec * 0.7) * 1.5;
          break;
        case "notifying":
          if (!context.notifyPop && localSec > 0.12) {
            context.notifyPop = true;
            requestBlink = true;
            yVelocity = -26;
          }
          rollDeg = restRollDeg + 3;
          xPx = 2;
          yPx = -1;
          break;
      }

      return {
        rollDeg,
        xPx,
        yPx,
        squashX,
        squashY,
        deformation,
        impulse: Object.freeze({ yVelocity, rollVelocity, spin }),
        requestBlink,
      };
    }

    return Object.freeze({ sample });
  }

  g.OPET_MOTION = Object.freeze({ create });
})(globalThis[Symbol.for("o-pet.renderer")]);
