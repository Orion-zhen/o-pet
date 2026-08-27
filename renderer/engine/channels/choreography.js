// @ts-check
/* 跨通道时间点只在编排层声明；各控制器不直接调用其他通道。 */
/** @param {import("../../types.js").MathPort} math */
function create(math) {
  const { rand, random, sign } = math;

  /** @param {string} type @param {{ turns?: number, direction?: number }} [details] @returns {import("../../types.js").ChoreographyEvent} */
  const action = (type, details = {}) =>
    Object.freeze({ channel: "action", type, ...details });

  /** @param {string | null} scene @param {number} localSec @param {import("../../types.js").ChoreographyContext} context @param {import("../../types.js").ControllerOptions} [options] */
  function sample(scene, localSec, context, options = {}) {
    /** @type {import("../../types.js").ChoreographyEvent[]} */
    const events = [];
    const direction = () => options.direction || sign();
    if (
      scene === "happy" &&
      localSec >= 0.12 &&
      !context.happyBounced
    ) {
      context.happyBounced = true;
      events.push(action("hop"));
    }
    if (
      scene === "playful" &&
      localSec >= 0.12 &&
      !context.playfulSpun
    ) {
      context.playfulSpun = true;
      events.push(
        random() < 0.5
          ? action("spin", { turns: 1, direction: direction() })
          : action("spin-dizzy", { direction: direction() }),
      );
    }
    if (
      scene === "proud" &&
      localSec >= 0.12 &&
      !context.proudFlourished
    ) {
      context.proudFlourished = true;
      events.push(action("spin-bounce", { direction: direction() }));
    }
    if (
      scene === "waking" &&
      localSec >= 0.5 &&
      localSec < 1.2 &&
      !context.wakingBurst
    ) {
      context.wakingBurst = true;
      events.push(
        Object.freeze({
          channel: "particles",
          type: "burst",
          count: rand(9, 13),
          strength: 0.8,
        }),
      );
    }
    return events;
  }

  return Object.freeze({ sample });
}

export { create };
