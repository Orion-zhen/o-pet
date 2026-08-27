// @ts-check
/* Agent 活动导演。只管理活动生命周期和依赖运行状态的分支。 */
import {
  create as createSequences,
  focusedRegistry,
  loopRegistry,
} from "../catalog/activity-sequences.js";

/**
 * @typedef {Exclude<import("../types.js").Activity, "idle">} WorkActivity
 * @param {{ now: () => number, random: () => number, scenes: typeof import("../catalog/presets.js").scenes, timeline: import("../types.js").Timeline }} options
 */
function create(options) {
  const { now, random, scenes, timeline } = options;
  const sequences = createSequences({ random, scenes });
  /** @type {WorkActivity | null} */
  let activity = null;
  let activityAt = 0;
  let lastProgressAt = -Infinity;
  let generation = 0;

  /** @param {WorkActivity} expected @param {number} token */
  function stillIn(expected, token) {
    return activity === expected && generation === token;
  }

  /** @param {WorkActivity} expected @param {number} token */
  function repeat(expected, token) {
    return () => {
      if (stillIn(expected, token)) run(expected, token, false);
    };
  }

  /** @param {"thinking" | "searching"} name @param {number} token */
  function runFocused(name, token) {
    timeline.play("activity", sequences.focused(name), {
      onComplete: repeat(name, token),
    });
  }

  /** @param {number} token @param {boolean} initial */
  function runTerminal(token, initial) {
    timeline.play("activity", sequences.terminal(initial), {
      onComplete() {
        if (!stillIn("terminal", token)) return;
        const elapsed = now() - activityAt;
        const hasRecentOutput = now() - lastProgressAt < 5000;
        if (!hasRecentOutput && elapsed >= 20_000 && random() < 0.4) {
          timeline.play("activity", sequences.terminalBored(), {
            onComplete: () => {
              if (stillIn("terminal", token)) runTerminal(token, false);
            },
          });
        } else {
          runTerminal(token, false);
        }
      },
    });
  }

  /** @param {number} token @param {boolean} initial */
  function runApproval(token, initial) {
    const waiting = now() - activityAt >= 45_000 ? "bored" : "listening";
    timeline.play("activity", sequences.approval(initial, waiting), {
      onComplete() {
        if (stillIn("awaiting_approval", token)) runApproval(token, false);
      },
    });
  }

  /** @param {WorkActivity} name @param {number} token @param {boolean} initial */
  function run(name, token, initial) {
    if (!stillIn(name, token)) return;
    if (name === "replying") {
      timeline.play("activity", sequences.replying(initial), {
        onComplete: repeat(name, token),
      });
      return;
    }
    if (focusedRegistry.has(name)) {
      runFocused(
        /** @type {"thinking" | "searching"} */ (name),
        token,
      );
      return;
    }
    if (loopRegistry.has(name)) {
      timeline.play("activity", sequences.loop(name), {
        onComplete: repeat(name, token),
      });
      return;
    }
    if (name === "terminal") {
      runTerminal(token, true);
      return;
    }
    if (name === "awaiting_approval") {
      runApproval(token, true);
      return;
    }
    throw new Error(`活动缺少动画配方: ${name}`);
  }

  /** @param {WorkActivity} name @param {number} startedAt @param {boolean} prepareReply */
  function start(name, startedAt, prepareReply) {
    activity = name;
    activityAt = startedAt;
    const token = ++generation;
    run(name, token, prepareReply);
  }

  function progress() {
    lastProgressAt = now();
  }

  function resetProgress() {
    lastProgressAt = -Infinity;
  }

  function stop() {
    activity = null;
    generation += 1;
    timeline.cancel("activity");
  }

  return Object.freeze({ progress, resetProgress, start, stop });
}

export { create };
