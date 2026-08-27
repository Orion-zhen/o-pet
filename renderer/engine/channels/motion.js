// @ts-check
/* 身体运动控制器。只计算身体目标和身体瞬态动作，不决定眼形、视线或特效。 */
import {
  create as createRegistry,
  validateMappings,
} from "../../catalog/registry.js";
import { create as createDefinitions } from "./motion-definitions.js";

/** @type {Readonly<Record<string, string>>} */
const STATE_MODES = Object.freeze({
  spawning: "neutral",
  waking: "waking",
  idle: "idle",
  sleeping: "sleeping",
  drowsy: "drowsy",
  dreaming: "dreaming",
  stretching: "stretching",
  startled: "startled",
  quizzical: "quizzical",
  dragging: "dragging",
  listening: "listening",
  curious: "curious",
  bored: "bored",
  playful: "playful",
  thinking: "thinking",
  "thinking-alt": "thinking-alt",
  humming: "humming",
  searching: "searching",
  working: "working",
  alerting: "neutral",
  notifying: "notifying",
  happy: "happy",
  shy: "shy",
  surprised: "surprised",
  confused: "confused",
  angry: "angry",
  proud: "proud",
  celebrate: "celebrate",
  sad: "sad",
  excited: "excited",
  suspicious: "suspicious",
  winking: "neutral",
  laughing: "laughing",
  scared: "scared",
  orbit: "neutral",
  dictating: "neutral",
  writing: "neutral",
  uploading: "neutral",
  bouncing: "neutral",
  "powering-down": "neutral",
});
const registry = createRegistry("motion", Object.keys(STATE_MODES));

/** @param {import("../../types.js").MathPort} math @param {{ THINKING_ALT: { absorbAt: number, cycleMs: number, dotDuration: number, dotStarts: readonly number[] } }} tables */
function create(math, tables) {
  const definitions = createDefinitions(math, tables);
  validateMappings("motion", STATE_MODES, definitions);

  /** @param {string} state @param {number} globalSec @param {number} localSec @param {number} now @param {import("../../types.js").MotionContext} context @param {import("../../types.js").ControllerOptions} [options] */
  function sample(state, globalSec, localSec, now, context, options = {}) {
    const mode = STATE_MODES[state];
    if (mode === undefined) throw new Error(`未知 motion 控制器: ${state}`);
    const handler = definitions[mode];
    if (handler === undefined)
      throw new Error(`motion 控制器 ${state} 没有采样实现`);
    const output = {
      rollDeg: 0,
      xPx: 0,
      yPx: 0,
      squashX: 1,
      squashY: 1,
      yVelocity: 0,
      rollVelocity: 0,
      /** @type {[number, number] | null} */
      spin: null,
      requestBlink: false,
      /** @type {import("../../types.js").BodyDeformation | null} */
      deformation: null,
    };
    handler({ globalSec, localSec, now, context, options }, output);
    return {
      rollDeg: output.rollDeg,
      xPx: output.xPx,
      yPx: output.yPx,
      squashX: output.squashX,
      squashY: output.squashY,
      deformation: output.deformation,
      impulse: Object.freeze({
        yVelocity: output.yVelocity,
        rollVelocity: output.rollVelocity,
        spin: output.spin,
      }),
      requestBlink: output.requestBlink,
    };
  }

  return Object.freeze({ sample });
}

export { create, registry };
