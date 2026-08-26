/* 跨通道时间点只在编排层声明；各控制器不直接调用其他通道。 */
(function (g) {
  function create(math) {
    const { rand } = math;

    function sample(scene, localSec, context) {
      const events = [];
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
