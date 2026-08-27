// @ts-check
/* 跨通道事件轨道。轨道按局部时间发出一次性动作，不直接调用其他通道。 */
import { create as createRegistry } from "../../catalog/registry.js";

const registry = createRegistry("choreography", [
  "happy",
  "playful",
  "proud",
  "waking",
]);

/**
 * @typedef {{ at: number, until?: number, emit: (options: import("../../types.js").ControllerOptions) => import("../../types.js").ChoreographyEvent }} TrackEvent
 * @param {import("../../types.js").MathPort} math
 */
function create(math) {
  const { rand, random, sign } = math;

  /** @param {string} type @param {{ turns?: number, direction?: number }} [details] @returns {import("../../types.js").ChoreographyEvent} */
  const action = (type, details = {}) =>
    Object.freeze({ channel: "action", type, ...details });
  /** @param {import("../../types.js").ControllerOptions} options */
  const direction = (options) => options.direction || sign();
  /** @type {(options: import("../../types.js").ControllerOptions) => import("../../types.js").ChoreographyEvent} */
  const playfulEvent = (options) =>
    random() < 0.5
      ? action("spin", { turns: 1, direction: direction(options) })
      : action("spin-dizzy", { direction: direction(options) });
  /** @type {(options: import("../../types.js").ControllerOptions) => import("../../types.js").ChoreographyEvent} */
  const proudEvent = (options) =>
    action("spin-bounce", { direction: direction(options) });

  /** @type {Readonly<Record<string, readonly TrackEvent[]>>} */
  const tracks = Object.freeze({
    happy: Object.freeze([
      Object.freeze({ at: 0.12, emit: () => action("hop") }),
    ]),
    playful: Object.freeze([
      Object.freeze({ at: 0.12, emit: playfulEvent }),
    ]),
    proud: Object.freeze([
      Object.freeze({ at: 0.12, emit: proudEvent }),
    ]),
    waking: Object.freeze([
      Object.freeze({
        at: 0.5,
        until: 1.2,
        emit: () =>
          Object.freeze({
            channel: "particles",
            type: "burst",
            count: rand(9, 13),
            strength: 0.8,
          }),
      }),
    ]),
  });

  /** @param {string | null} scene @param {number} localSec @param {import("../../types.js").ChoreographyContext} context @param {import("../../types.js").ControllerOptions} [options] */
  function sample(scene, localSec, context, options = {}) {
    if (scene === null) return [];
    const track = tracks[scene];
    if (track === undefined)
      throw new Error(`未知 choreography 控制器: ${scene}`);
    /** @type {import("../../types.js").ChoreographyEvent[]} */
    const events = [];
    for (let index = 0; index < track.length; index++) {
      const event = track[index];
      if (
        event !== undefined &&
        localSec >= event.at &&
        (event.until === undefined || localSec < event.until) &&
        !context.fired.has(index)
      ) {
        context.fired.add(index);
        events.push(event.emit(options));
      }
    }
    return events;
  }

  return Object.freeze({ sample });
}

export { create, registry };
