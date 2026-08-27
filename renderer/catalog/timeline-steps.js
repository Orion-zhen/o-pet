// @ts-check
/* 判别式时间线步骤和一次性事件构建器。 */

/**
 * @param {import("../types.js").Scene} value
 * @param {number} duration
 * @param {{ events?: readonly import("../types.js").TimelineEvent[], preserveEffect?: boolean, restart?: boolean }} [options]
 * @returns {Readonly<import("../types.js").TimelineStep>}
 */
const scene = (value, duration, options = {}) =>
  Object.freeze({ kind: "scene", scene: value, duration, ...options });

/** @param {string} name @param {number} duration @returns {Readonly<import("../types.js").TimelineStep>} */
const state = (name, duration) =>
  Object.freeze({ kind: "state", state: name, duration });

/** @param {number} duration @returns {Readonly<import("../types.js").TimelineStep>} */
const pause = (duration) => Object.freeze({ kind: "pause", duration });

/** @param {...Readonly<import("../types.js").TimelineStep>} values @returns {readonly Readonly<import("../types.js").TimelineStep>[]} */
const sequence = (...values) => Object.freeze(values);

/** @returns {Readonly<import("../types.js").TimelineEvent>} */
const wink = () => Object.freeze({ kind: "wink" });

/** @param {number} [turns] @param {number} [direction] @returns {Readonly<import("../types.js").TimelineEvent>} */
function spin(turns = 1, direction) {
  return Object.freeze({
    kind: "spin",
    turns,
    ...(direction === undefined ? {} : { direction }),
  });
}

/** @returns {Readonly<import("../types.js").TimelineEvent>} */
const hop = () => Object.freeze({ kind: "hop" });

/** @param {number} strength @param {number} [direction] @returns {Readonly<import("../types.js").TimelineEvent>} */
function pounce(strength, direction) {
  return Object.freeze({
    kind: "pounce",
    strength,
    ...(direction === undefined ? {} : { direction }),
  });
}

export { hop, pause, pounce, scene, sequence, spin, state, wink };
