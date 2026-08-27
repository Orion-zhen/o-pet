// @ts-check
/* 形变通道采样器。按定义优先级聚合身体缩放、位移和透明度贡献。 */

/**
 * @param {{ data: import("../../types.js").GeometryData, definitions: Readonly<Record<string, import("./contracts.js").EffectDefinition>> }} dependencies
 */
function create(dependencies) {
  const definitions = Object.values(dependencies.definitions);
  const scaleDefinitions = definitions
    .filter((definition) => definition.sampleScale !== undefined)
    .sort((left, right) => (left.scaleOrder ?? 0) - (right.scaleOrder ?? 0));
  const offsetDefinitions = definitions
    .filter((definition) => definition.sampleOffset !== undefined)
    .sort((left, right) => (left.offsetOrder ?? 0) - (right.offsetOrder ?? 0));
  const opacityDefinitions = definitions.filter(
    (definition) => definition.sampleOpacity !== undefined,
  );

  /** @param {string} name */
  function radiusOf(name) {
    const radius = dependencies.definitions[name]?.radius;
    if (radius === undefined) throw new Error(`形变 ${name} 缺少半径`);
    return radius;
  }

  /** @param {string} name @param {string | null} current @param {string | null} previous @param {number} amount @param {number} mix */
  function effectAmount(name, current, previous, amount, mix) {
    if (name === current) return amount * mix;
    if (name === previous) return amount * (1 - mix);
    return 0;
  }

  /** @param {import("./contracts.js").EffectDefinition} definition @param {string | null} current @param {string | null} previous */
  const isActive = (definition, current, previous) =>
    definition.id === current || definition.id === previous;

  /** @param {import("./contracts.js").EffectLayer} layer @param {number} now @param {number} stateAt @param {string | null} current @param {string | null} previous @param {number} amount @param {number} mix @param {boolean} reduce @returns {import("./contracts.js").FormSample} */
  function sample(
    layer,
    now,
    stateAt,
    current,
    previous,
    amount,
    mix,
    reduce,
  ) {
    let scale = 1;
    let dotsAmount = 0;
    /** @type {import("./contracts.js").DotPulse} */
    let dotPulse = { lift: 0, pop: 1, tone: 1 };
    for (const definition of scaleDefinitions) {
      if (!isActive(definition, current, previous) || !definition.sampleScale)
        continue;
      const contribution = definition.sampleScale(layer, {
        now,
        stateAt,
        amount,
        effectAmount: effectAmount(
          definition.id,
          current,
          previous,
          amount,
          mix,
        ),
        reduce,
      });
      scale *= contribution.multiplier;
      if (contribution.dotsAmount !== undefined)
        dotsAmount = contribution.dotsAmount;
      if (contribution.dotPulse !== undefined)
        dotPulse = contribution.dotPulse;
    }

    let xPx = 0;
    let yPx = 0;
    let rollDeg = 0;
    for (const definition of offsetDefinitions) {
      if (!isActive(definition, current, previous) || !definition.sampleOffset)
        continue;
      const contribution = definition.sampleOffset(layer, {
        now,
        stateAt,
        amount,
        effectAmount: effectAmount(
          definition.id,
          current,
          previous,
          amount,
          mix,
        ),
        reduce,
      });
      xPx += contribution.xPx ?? 0;
      yPx += contribution.yPx ?? 0;
      rollDeg += contribution.rollDeg ?? 0;
    }

    let opacityFade = 0;
    for (const definition of opacityDefinitions) {
      if (!isActive(definition, current, previous) || !definition.sampleOpacity)
        continue;
      opacityFade += definition.sampleOpacity(layer, {
        now,
        stateAt,
        amount,
        effectAmount: effectAmount(
          definition.id,
          current,
          previous,
          amount,
          mix,
        ),
        reduce,
      });
    }

    const currentRadius = current === null ? 19 : radiusOf(current);
    const previousRadius = previous === null ? currentRadius : radiusOf(previous);
    const radiusPx =
      current === null
        ? 19
        : currentRadius * mix + previousRadius * (1 - mix);
    return {
      dotsAmount,
      dotPulse,
      xPx,
      yPx,
      rollDeg,
      radiusScale: (radiusPx / dependencies.data.Re) * scale,
      opacityFade,
      radiusPx,
    };
  }

  return sample;
}

export { create };
