// @ts-check
/* 脸部姿态控制器注册与分派。具体定义位于 expression-definitions.js。 */
import {
  create as createRegistry,
  validateMappings,
} from "../../catalog/registry.js";
import { create as createDefinitions } from "./expression-definitions.js";

/** @type {Readonly<Record<string, string>>} */
const STATE_MODES = Object.freeze({
  spawning: "neutral",
  waking: "waking",
  idle: "neutral",
  sleeping: "sleeping",
  drowsy: "drowsy",
  dreaming: "dreaming",
  stretching: "stretching",
  startled: "startled",
  quizzical: "quizzical",
  dragging: "dragging",
  listening: "neutral",
  curious: "curious",
  bored: "bored",
  playful: "playful",
  thinking: "neutral",
  "thinking-alt": "neutral",
  humming: "neutral",
  searching: "neutral",
  working: "neutral",
  alerting: "neutral",
  notifying: "notifying",
  happy: "happy",
  shy: "shy",
  surprised: "surprised",
  confused: "confused",
  angry: "neutral",
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
const registry = createRegistry("face", Object.keys(STATE_MODES));

/** @param {import("../../types.js").MathPort} math @param {import("../../types.js").AnimationTables} tables */
function create(math, tables) {
  const definitions = createDefinitions(math, tables);
  validateMappings("face", STATE_MODES, definitions);

  /** @param {string} state @param {number} globalSec @param {number} localSec @param {number} now @param {import("../../types.js").ExpressionContext} context @param {import("../../types.js").ControllerOptions} [options] */
  function sample(state, globalSec, localSec, now, context, options = {}) {
    const mode = STATE_MODES[state];
    if (mode === undefined) throw new Error(`未知 face 控制器: ${state}`);
    const handler = definitions[mode];
    if (handler === undefined)
      throw new Error(`face 控制器 ${state} 没有采样实现`);
    const output = {
      restLid: 1,
      eyeScale: 1,
      faceRollDeg: 0,
      /** @type {[number, number] | null} */
      eyeLids: null,
      /** @type {[number, number] | null} */
      eyeTarget: null,
      requestBlink: false,
    };
    handler({ globalSec, localSec, now, context, options }, output);
    return output;
  }

  return Object.freeze({ sample });
}

export { create, registry };
