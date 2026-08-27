// @ts-check
/* 视线控制器注册与分派。具体视线定义位于 gaze-definitions.js。 */
import {
  create as createRegistry,
  validateMappings,
} from "../../catalog/registry.js";
import { create as createDefinitions } from "./gaze-definitions.js";

/** @type {Readonly<Record<string, string>>} */
const STATE_MODES = Object.freeze({
  spawning: "ambient",
  waking: "ambient",
  idle: "idle",
  sleeping: "sleeping",
  drowsy: "drowsy",
  startled: "ambient",
  front: "front",
  petting: "happy",
  dragging: "ambient",
  bored: "bored",
  playful: "playful",
  listening: "listening",
  searching: "searching",
  curious: "curious",
  thinking: "thinking",
  working: "working",
  notifying: "notifying",
  alerting: "ambient",
  happy: "happy",
  shy: "shy",
  surprised: "surprised",
  confused: "confused",
  angry: "angry",
  proud: "proud",
  celebrate: "ambient",
  sad: "sad",
  excited: "excited",
  suspicious: "suspicious",
  winking: "ambient",
  laughing: "laughing",
  scared: "scared",
  orbit: "ambient",
  dictating: "ambient",
  writing: "ambient",
  uploading: "ambient",
  bouncing: "ambient",
  "powering-down": "ambient",
  dreaming: "dreaming",
});
const registry = createRegistry("gaze", Object.keys(STATE_MODES));

/** @param {import("../../types.js").MathPort} math */
function create(math) {
  const definitions = createDefinitions(math);
  validateMappings("gaze", STATE_MODES, definitions);

  /** @param {string} state @param {number} [direction] */
  function next(state, direction = 0) {
    const mode = STATE_MODES[state];
    if (mode === undefined) throw new Error(`未知 gaze 控制器: ${state}`);
    const handler = definitions[mode];
    if (handler === undefined)
      throw new Error(`gaze 控制器 ${state} 没有采样实现`);
    const side = direction || math.sign();
    return handler(direction, side);
  }

  return Object.freeze({ next });
}

export { create, registry };
