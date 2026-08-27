// @ts-check
/* 空闲行为导演。独立管理空闲深度、片段历史、冷却和能量。 */
import { create as createFragments } from "../catalog/idle-fragments.js";
import * as timelineSteps from "../catalog/timeline-steps.js";

/**
 * @typedef {{ startedAt: number, relaxedAt: number, drowsyAt: number, sleepingAt: number, wakeAt: number }} IdleSession
 * @typedef {"low" | "medium" | "high"} Energy
 * @param {{ now: () => number, presets: import("../types.js").PresetCatalog, random: () => number, scenes: typeof import("../catalog/presets.js").scenes, timeline: import("../types.js").Timeline }} options
 */
function create(options) {
  const { now, presets, random, scenes, timeline } = options;
  /** @type {Map<string, number>} */
  const fragmentLastAt = new Map();
  /** @type {Map<string, number>} */
  const lastDirection = new Map();
  /** @type {IdleSession | null} */
  let session = null;
  /** @type {import("../types.js").IdleDepth} */
  let depth = "awake";
  let recoveryUntil = 0;
  let quietUntil = 0;
  let energyBudget = 3;
  /** @type {Energy} */
  let previousEnergy = "low";
  /** @type {string[]} */
  let recentFragments = [];
  /** @type {number[]} */
  let pokeTimes = [];
  let lastHoverAt = -Infinity;
  /** @type {"stopped" | "idle" | "fragment" | "natural-wake"} */
  let phase = "stopped";
  let generation = 0;

  /** @param {readonly [number, number]} range */
  const randomDelay = ([minimum, maximum]) =>
    minimum + Math.floor(random() * (maximum - minimum + 1));
  const HAPPY_SCENE_MS = 1400;
  const QUICK_HAPPY_SCENE_MS = 900;
  const STRETCHING_SCENE_MS = 3500;

  /** @param {string} key */
  function chooseDirection(key) {
    let direction = random() < 0.5 ? -1 : 1;
    if (lastDirection.get(key) === direction) direction *= -1;
    lastDirection.set(key, direction);
    return direction;
  }

  /** @param {import("../types.js").Preset} base @param {import("../types.js").SceneDetails} details */
  const withDetails = (base, details) => presets.withDetails(base, details);
  const fragments = createFragments({
    chooseDirection,
    presets,
    random,
    randomDelay,
    scenes,
  });

  /** @param {number} startedAt @returns {IdleSession} */
  function createSession(startedAt) {
    const relaxedAt = randomDelay([90_000, 150_000]);
    const drowsyAt = Math.max(
      relaxedAt + 60_000,
      randomDelay([240_000, 420_000]),
    );
    const sleepingAt = Math.max(
      drowsyAt + 180_000,
      randomDelay([600_000, 900_000]),
    );
    const wakeAt = sleepingAt + randomDelay([300_000, 480_000]);
    return { startedAt, relaxedAt, drowsyAt, sleepingAt, wakeAt };
  }

  /** @param {number} [startedAt] */
  function reset(startedAt = now()) {
    session = createSession(startedAt);
    depth = "awake";
    recoveryUntil = 0;
    quietUntil = 0;
    energyBudget = 3;
    previousEnergy = "low";
    recentFragments = [];
    fragmentLastAt.clear();
  }

  /** @param {number} [at] @returns {import("../types.js").IdleDepth} */
  function depthAt(at = now()) {
    if (!session) return "awake";
    const elapsed = at - session.startedAt;
    if (elapsed >= session.wakeAt) return "awake";
    if (elapsed >= session.sleepingAt)
      return at < recoveryUntil ? "drowsy" : "sleeping";
    if (elapsed >= session.drowsyAt) return "drowsy";
    if (elapsed >= session.relaxedAt) return "relaxed";
    return "awake";
  }

  function syncDepth() {
    depth = depthAt();
    return depth;
  }

  function nextBoundary() {
    if (!session) return Infinity;
    const at = now();
    const elapsed = at - session.startedAt;
    if (elapsed < session.relaxedAt)
      return session.startedAt + session.relaxedAt;
    if (elapsed < session.drowsyAt)
      return session.startedAt + session.drowsyAt;
    if (elapsed < session.sleepingAt)
      return session.startedAt + session.sleepingAt;
    if (at < recoveryUntil)
      return Math.min(recoveryUntil, session.startedAt + session.wakeAt);
    if (elapsed < session.wakeAt) return session.startedAt + session.wakeAt;
    return Infinity;
  }

  function baseScene() {
    if (depth === "drowsy") return scenes.drowsy;
    if (depth === "sleeping") return scenes.sleeping;
    return scenes.idle;
  }

  function selectFragment() {
    const at = now();
    const recent = new Set(recentFragments.slice(-3));
    /** @param {(typeof fragments)[number]} fragment */
    const supportsEnergy = (fragment) =>
      fragment.energy !== "high" ||
      (energyBudget >= 3 && previousEnergy !== "high");
    /** @param {(typeof fragments)[number]} fragment */
    const cooled = (fragment) =>
      at - (fragmentLastAt.get(fragment.name) ?? -Infinity) >=
      fragment.cooldown;
    const phaseCandidates = fragments.filter(
      (fragment) =>
        fragment.phases.includes(depth) &&
        cooled(fragment) &&
        supportsEnergy(fragment),
    );
    let candidates = phaseCandidates.filter(
      (fragment) => !recent.has(fragment.name),
    );
    if (candidates.length === 0) {
      const previous = recentFragments.at(-1);
      candidates = phaseCandidates.filter(
        (fragment) => fragment.name !== previous,
      );
    }
    if (candidates.length === 0) return null;
    const total = candidates.reduce(
      (sum, fragment) => sum + fragment.weight,
      0,
    );
    let target = random() * total;
    let selected = candidates[candidates.length - 1];
    for (const candidate of candidates) {
      target -= candidate.weight;
      if (target <= 0) {
        selected = candidate;
        break;
      }
    }
    if (selected === undefined) throw new Error(`空闲深度 ${depth} 没有可用片段`);
    fragmentLastAt.set(selected.name, at);
    recentFragments.push(selected.name);
    if (recentFragments.length > 6) recentFragments.shift();
    if (selected.energy === "high") energyBudget = 0;
    else if (selected.energy === "low")
      energyBudget = Math.min(3, energyBudget + 1);
    else energyBudget = Math.min(3, energyBudget + 0.5);
    previousEnergy = selected.energy;
    return selected;
  }

  function interval() {
    if (depth === "relaxed") return randomDelay([8000, 14_000]);
    if (depth === "drowsy") return randomDelay([10_000, 18_000]);
    if (depth === "sleeping") return randomDelay([18_000, 30_000]);
    return randomDelay([5000, 9000]);
  }

  function startNaturalWake() {
    const direction = chooseDirection("natural-wake");
    const delighted = random() < 0.15;
    reset(now());
    phase = "natural-wake";
    const token = ++generation;
    timeline.play(
      "idle",
      [
        timelineSteps.scene(
          withDetails(scenes.stretching, { direction }),
          STRETCHING_SCENE_MS,
        ),
        delighted
          ? timelineSteps.scene(scenes.quickHappy, QUICK_HAPPY_SCENE_MS, {
              events: [timelineSteps.wink()],
            })
          : timelineSteps.scene(scenes.happy, HAPPY_SCENE_MS),
      ],
      {
        onComplete() {
          if (generation === token && phase === "natural-wake") start();
        },
      },
    );
  }

  function start() {
    if (!session) reset();
    const currentSession = session;
    if (!currentSession) throw new Error("空闲会话初始化失败");
    if (now() - currentSession.startedAt >= currentSession.wakeAt) {
      startNaturalWake();
      return;
    }
    const token = ++generation;
    phase = "idle";
    syncDepth();
    let delay = interval();
    if (quietUntil > now()) delay = Math.max(delay, quietUntil - now());
    const boundary = nextBoundary();
    delay = Math.min(delay, boundary - now());
    const previousDepth = depth;
    timeline.play("idle", [timelineSteps.scene(baseScene(), delay)], {
      onComplete() {
        if (generation !== token || phase !== "idle") return;
        syncDepth();
        if (depth !== previousDepth || now() >= boundary) {
          start();
          return;
        }
        const fragment = selectFragment();
        if (!fragment) {
          start();
          return;
        }
        phase = "fragment";
        const fragmentToken = ++generation;
        const wasHigh = fragment.energy === "high";
        timeline.play("idle", fragment.build(), {
          onComplete() {
            if (generation !== fragmentToken || phase !== "fragment") return;
            if (wasHigh) quietUntil = now() + randomDelay([20_000, 30_000]);
            start();
          },
        });
      },
    });
  }

  function stop() {
    phase = "stopped";
    generation += 1;
    timeline.cancel("idle");
  }

  function leave() {
    const currentDepth = syncDepth();
    stop();
    session = null;
    recoveryUntil = 0;
    quietUntil = 0;
    pokeTimes = [];
    return currentDepth === "drowsy" || currentDepth === "sleeping";
  }

  function hover() {
    if (
      (phase !== "idle" && phase !== "fragment") ||
      now() - lastHoverAt < 45_000
    )
      return false;
    syncDepth();
    if (depth !== "awake" && depth !== "relaxed") return false;
    lastHoverAt = now();
    /** @type {import("../types.js").TimelineStep[]} */
    const steps = [
      timelineSteps.scene(scenes.curious, 500),
      timelineSteps.scene(scenes.front, 1300),
    ];
    if (random() < 0.18)
      steps.push(
        timelineSteps.scene(scenes.quickHappy, 700, {
          events: [timelineSteps.wink()],
        }),
      );
    phase = "fragment";
    const token = ++generation;
    timeline.play("idle", steps, {
      onComplete() {
        if (generation === token && phase === "fragment") start();
      },
    });
    return true;
  }

  function recordPoke() {
    const cutoff = now() - 25_000;
    pokeTimes = pokeTimes.filter((at) => at >= cutoff);
    pokeTimes.push(now());
    if (pokeTimes.length < 3) return false;
    pokeTimes = [];
    return true;
  }

  function recoverFromSleep() {
    recoveryUntil = now() + randomDelay([20_000, 40_000]);
  }

  return Object.freeze({
    chooseDirection,
    depthAt,
    hover,
    leave,
    recordPoke,
    recoverFromSleep,
    reset,
    start,
    stop,
  });
}

export { create };
