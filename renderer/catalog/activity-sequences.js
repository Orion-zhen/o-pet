// @ts-check
/* 活动动画配方。只描述场景、时长、权重和步骤事件。 */
import { create as createRegistry } from "./registry.js";
import * as steps from "./timeline-steps.js";

/** @typedef {{ name: string, scene: string, weight: number, duration: readonly [number, number] }} AccentRecipe */
/** @typedef {{ scene: string, duration: readonly [number, number], events?: () => readonly import("../types.js").TimelineEvent[] }} StepRecipe */
/** @param {number} minimum @param {number} maximum @returns {readonly [number, number]} */
const range = (minimum, maximum) => Object.freeze([minimum, maximum]);

/** @type {Readonly<Record<string, { base: StepRecipe, accents: readonly AccentRecipe[] }>>} */
const FOCUSED = Object.freeze({
  thinking: Object.freeze({
    base: Object.freeze({ scene: "thinking", duration: range(3000, 6000) }),
    accents: Object.freeze([
      Object.freeze({
        name: "humming",
        scene: "humming",
        weight: 0.4,
        duration: range(6000, 9000),
      }),
      Object.freeze({
        name: "thinking-alt",
        scene: "thinking-alt",
        weight: 0.36,
        duration: range(6000, 9000),
      }),
      Object.freeze({
        name: "deep",
        scene: "deepThinking",
        weight: 0.16,
        duration: range(3500, 5500),
      }),
      Object.freeze({
        name: "radar",
        scene: "radar",
        weight: 0.08,
        duration: range(3200, 4800),
      }),
    ]),
  }),
  searching: Object.freeze({
    base: Object.freeze({ scene: "searching", duration: range(3500, 6500) }),
    accents: Object.freeze([
      Object.freeze({
        name: "curious",
        scene: "curious",
        weight: 0.45,
        duration: range(1400, 2400),
      }),
      Object.freeze({
        name: "radar",
        scene: "radar",
        weight: 0.35,
        duration: range(2500, 4000),
      }),
      Object.freeze({
        name: "thinking",
        scene: "deepThinking",
        weight: 0.2,
        duration: range(1800, 3000),
      }),
    ]),
  }),
});

/** @type {Readonly<Record<string, readonly StepRecipe[]>>} */
const LOOPS = Object.freeze({
  coding: Object.freeze([
    Object.freeze({ scene: "coding", duration: range(10_000, 16_000) }),
    Object.freeze({
      scene: "reviewing",
      duration: range(2200, 3200),
      events: () => [steps.spin()],
    }),
  ]),
  receiving: Object.freeze([
    Object.freeze({ scene: "receiving", duration: range(5000, 8000) }),
    Object.freeze({ scene: "curious", duration: range(1200, 2200) }),
  ]),
  consulting: Object.freeze([
    Object.freeze({ scene: "consulting", duration: range(4000, 6500) }),
    Object.freeze({ scene: "deepThinking", duration: range(1800, 3000) }),
  ]),
  tooling: Object.freeze([
    Object.freeze({ scene: "tooling", duration: range(4500, 7000) }),
    Object.freeze({ scene: "loading", duration: range(3000, 5000) }),
  ]),
  replying: Object.freeze([
    Object.freeze({ scene: "replying", duration: range(6000, 10_000) }),
    Object.freeze({ scene: "listening", duration: range(700, 1200) }),
  ]),
});
const loopRegistry = createRegistry("activity sequence", Object.keys(LOOPS));
const focusedRegistry = createRegistry(
  "focused activity sequence",
  Object.keys(FOCUSED),
);

/**
 * @param {{ random: () => number, scenes: Readonly<Record<string, import("../types.js").Preset>> }} options
 */
function create(options) {
  const { random, scenes } = options;
  /** @type {Map<string, string>} */
  const lastAccent = new Map();

  /** @param {readonly [number, number]} range */
  const randomDelay = ([minimum, maximum]) =>
    minimum + Math.floor(random() * (maximum - minimum + 1));

  /** @param {string} name */
  function requiredScene(name) {
    const scene = scenes[name];
    if (scene === undefined) throw new Error(`活动配方引用了未知场景: ${name}`);
    return scene;
  }

  /** @param {StepRecipe} recipe */
  const buildStep = (recipe) =>
    steps.scene(requiredScene(recipe.scene), randomDelay(recipe.duration), {
      ...(recipe.events === undefined ? {} : { events: recipe.events() }),
    });

  /** @param {string} name */
  function focused(name) {
    const recipe = FOCUSED[name];
    if (recipe === undefined)
      throw new Error(`未知专注活动动画配方: ${name}`);
    const previous = lastAccent.get(name);
    const available = recipe.accents.filter(
      (candidate) => candidate.name !== previous,
    );
    const total = available.reduce(
      (sum, candidate) => sum + candidate.weight,
      0,
    );
    let target = random() * total;
    let selected = available[available.length - 1];
    for (const candidate of available) {
      target -= candidate.weight;
      if (target <= 0) {
        selected = candidate;
        break;
      }
    }
    if (selected === undefined) throw new Error(`活动 ${name} 没有强调场景`);
    lastAccent.set(name, selected.name);
    return steps.sequence(
      buildStep(recipe.base),
      steps.scene(
        requiredScene(selected.scene),
        randomDelay(selected.duration),
      ),
    );
  }

  /** @param {string} name */
  function loop(name) {
    const recipe = LOOPS[name];
    if (recipe === undefined) throw new Error(`未知活动动画配方: ${name}`);
    return steps.sequence(...recipe.map(buildStep));
  }

  /** @param {boolean} initial */
  function terminal(initial) {
    return steps.sequence(
      ...(initial
        ? [
            steps.scene(
              requiredScene("terminalTyping"),
              randomDelay([650, 1100]),
            ),
          ]
        : []),
      steps.scene(requiredScene("loading"), randomDelay([4500, 7000])),
    );
  }

  const terminalBored = () =>
    steps.sequence(
      steps.scene(requiredScene("bored"), randomDelay([1400, 2400])),
    );

  /** @param {boolean} initial @param {"listening" | "bored"} waiting */
  function approval(initial, waiting) {
    return initial
      ? steps.sequence(steps.scene(requiredScene("alerting"), 1600))
      : steps.sequence(
          steps.scene(
            requiredScene(waiting),
            randomDelay([15_000, 25_000]),
          ),
          steps.scene(requiredScene("notifying"), 5000),
        );
  }

  return Object.freeze({ approval, focused, loop, terminal, terminalBored });
}

export { create, focusedRegistry, loopRegistry };
