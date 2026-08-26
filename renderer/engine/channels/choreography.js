/* 跨通道时间点只在编排层声明；各控制器不直接调用其他通道。 */
(function (g) {
  function create(math) {
    const { rand, random, sign } = math;

    const action = (type, details = {}) =>
      Object.freeze({ channel: "action", type, ...details });

    function sample(scene, localSec, context, options = {}) {
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

  g.GROK_CHOREOGRAPHY = Object.freeze({ create });
})(window);
