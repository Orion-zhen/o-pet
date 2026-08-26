/* 眼部表情控制器。只计算眼睑、眼睛缩放、脸部倾斜及眼部事件。 */
(function (g) {
  function create(math, tables) {
    const { clamp, K2 } = math;
    const { EYE_PLAYLIST } = tables;

    function sample(state, globalSec, localSec, _now, context, options = {}) {
      let restLid = 1;
      let eyeScale = 1;
      let faceRollDeg = 0;
      let eyeLids = null;
      let eyeTarget = null;
      let requestBlink = false;

      switch (state) {
        case "sleeping":
          if (EYE_PLAYLIST.sleeping.includes(options.eyeTo)) {
            restLid = options.eyeMorphX > 0.85 ? 1 : 0.08;
          } else if (localSec < 1.2) {
            const close = Math.min(1, localSec / 1);
            restLid = Math.max(
              0.08,
              1 - close * (1 + 0.15 * Math.sin(localSec * 6.5)),
            );
          } else {
            restLid = 0.08;
            if (options.blinkX < 0.18) eyeTarget = [13, 11];
          }
          break;
        case "dreaming":
          restLid = 0.06;
          break;
        case "waking":
          if (localSec < 0.5) {
            restLid = 0.07;
            eyeTarget = [3, 12];
          } else if (localSec < 1.2) {
            restLid = 1;
            eyeScale = 1.12;
          } else if (localSec < 2.2) {
            eyeTarget = [0, 7];
            if (localSec < 1.4 && !context.wakingBlinked) {
              context.wakingBlinked = true;
              requestBlink = true;
            }
          } else {
            eyeTarget = [0, 7];
          }
          break;
        case "excited":
          eyeScale = 1.06;
          break;
        case "surprised": {
          const settle = Math.min(localSec / 1.2, 1);
          eyeScale = 1.15 - settle * 0.08;
          break;
        }
        case "suspicious":
          restLid = 0.85;
          break;
        case "startled": {
          const elapsed = clamp(localSec / 0.65, 0, 1);
          eyeScale = 1.2 - elapsed * 0.08;
          break;
        }
        case "stretching":
          if (localSec < 0.45) {
            const amount = K2(localSec / 0.45);
            restLid = 1 - 0.5 * amount;
          } else if (localSec < 2.35) {
            const amount = K2((localSec - 0.45) / 1.9);
            restLid = 0.5 + 0.15 * amount;
          } else if (localSec < 2.75) {
            restLid = 0.65;
          } else {
            const amount = K2(clamp((localSec - 2.75) / 0.75, 0, 1));
            restLid = 0.65 + 0.35 * amount;
            if (amount > 0.42 && !context.stretchBlinked) {
              context.stretchBlinked = true;
              requestBlink = true;
            }
          }
          break;
        case "quizzical": {
          const direction = options.direction || 1;
          let amount;
          if (localSec < 0.15) amount = -0.2 * (1 - localSec / 0.15);
          else if (localSec < 0.55) amount = K2((localSec - 0.15) / 0.4);
          else if (localSec < 1.45)
            amount = 1 + 0.2 * K2((localSec - 0.55) / 0.9);
          else amount = 1.2 * (1 - K2(clamp((localSec - 1.45) / 0.75, 0, 1)));
          const bodyAngle = (options.reduceMotion ? 0 : 7.5) * amount;
          const faceAngle = 12 * amount;
          faceRollDeg = direction * (faceAngle - bodyAngle);
          eyeScale = 1.04;
          eyeLids = direction > 0 ? [1, 0.82] : [0.82, 1];
          if (localSec > 1.75 && !context.quizzicalBlinked) {
            context.quizzicalBlinked = true;
            requestBlink = true;
          }
          break;
        }
        case "drowsy":
          restLid = 0.34 + Math.sin(globalSec * 0.8) * 0.07;
          if (options.slumpAt) {
            const elapsed = (_now - options.slumpAt) / 1000;
            const sinkDuration = 1.7;
            const wakeDuration = 0.3;
            const recoverDuration = 1.5;
            if (elapsed < sinkDuration) {
              const phase = elapsed / sinkDuration;
              const curve = phase * phase;
              restLid = 0.34 - curve * (0.34 - 0.04);
            } else if (elapsed < sinkDuration + wakeDuration) {
              const phase = (elapsed - sinkDuration) / wakeDuration;
              const wake = Math.sin(phase * Math.PI);
              restLid = 0.04 + wake * 0.42;
            } else if (
              elapsed <
              sinkDuration + wakeDuration + recoverDuration
            ) {
              const phase =
                (elapsed - sinkDuration - wakeDuration) / recoverDuration;
              const recover = 1 - Math.pow(1 - phase, 2.2);
              restLid = 0.46 + (0.34 - 0.46) * recover;
              if (phase > 0.32 && phase < 0.46) restLid = 0.05;
            }
          }
          break;
        case "happy":
          eyeScale = 1.05;
          break;
        case "curious":
          eyeScale = 1.08;
          break;
        case "confused":
          restLid = 0.9;
          break;
        case "bored":
          restLid = 0.6;
          eyeScale = 0.98;
          break;
        case "proud":
          restLid = 0.9;
          eyeScale = 1.02;
          break;
        case "shy":
          restLid = 0.85;
          eyeScale = 0.95;
          break;
        case "sad":
          restLid = 0.7;
          eyeScale = 0.97;
          break;
        case "laughing":
          restLid = 0.7;
          break;
        case "scared":
          restLid = 1.05;
          eyeScale = 1.12;
          break;
        case "playful":
          eyeScale = 1.06;
          break;
        case "celebrate":
          restLid = 1.1;
          eyeScale = 1.1;
          break;
        case "dragging":
          if ((localSec % 3.4) / 3.4 >= 0.12 && (localSec % 3.4) / 3.4 < 0.62)
            eyeScale = 1.06;
          break;
        case "notifying":
          eyeScale = 1 + 0.05 * Math.exp(-localSec * 3);
          break;
      }

      return {
        restLid,
        eyeScale,
        faceRollDeg,
        eyeLids,
        eyeTarget,
        requestBlink,
      };
    }

    return Object.freeze({ sample });
  }

  g.GROK_EXPRESSION = Object.freeze({ create });
})(window);
