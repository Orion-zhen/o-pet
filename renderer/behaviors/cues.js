// @ts-check
/* 瞬态 Cue 导演。独立管理优先级、排队和有限序列。 */
/** @typedef {Exclude<import("../types.js").Cue, "progress">} AnimatedCue */
/** @type {Readonly<Record<import("../types.js").Cue, number>>} */
const PRIORITY = Object.freeze({
  engage: 1,
  progress: 0,
  reply_sent: 2,
  approval_granted: 2,
  approval_denied: 2,
  error_first: 3,
  error_repeated: 3,
  error_stubborn: 3,
  completed_quick: 4,
  completed_normal: 4,
  completed_hard: 4,
  run_failed: 4,
  run_aborted: 4,
});
/** @type {ReadonlySet<AnimatedCue>} */
const COMPLETION = new Set([
  "completed_quick",
  "completed_normal",
  "completed_hard",
  "run_failed",
  "run_aborted",
]);

/**
 * @param {{ sequences: Record<AnimatedCue, readonly import("../types.js").TimelineStep[]>, timeline: import("../types.js").Timeline, onFinished: () => void }} options
 */
function create(options) {
  const { sequences, timeline } = options;
  /** @type {AnimatedCue | null} */
  let current = null;
  /** @type {AnimatedCue | null} */
  let pending = null;
  const onFinished = options.onFinished;

  /** @param {AnimatedCue} cue */
  const priority = (cue) => PRIORITY[cue];

  /** @param {AnimatedCue} cue */
  function queue(cue) {
    if (!pending || priority(cue) > priority(pending)) pending = cue;
  }

  /** @param {AnimatedCue} cue */
  function play(cue) {
    const steps = sequences[cue];
    current = cue;
    timeline.play("cue", steps, {
      onComplete() {
        current = null;
        if (pending !== null) {
          const next = pending;
          pending = null;
          play(next);
        } else {
          onFinished();
        }
      },
    });
  }

  /** @param {AnimatedCue} cue @param {boolean} [protectedMode] */
  function request(cue, protectedMode = false) {
    if (protectedMode) {
      queue(cue);
      return;
    }
    if (current !== null) {
      if (current === "reply_sent" && COMPLETION.has(cue)) {
        pending = cue;
        return;
      }
      if (priority(cue) > priority(current)) {
        play(cue);
        return;
      }
      queue(cue);
      return;
    }
    play(cue);
  }

  function playPending() {
    if (pending === null) return false;
    const cue = pending;
    pending = null;
    play(cue);
    return true;
  }

  function cancel(clearPending = true) {
    timeline.cancel("cue");
    current = null;
    if (clearPending) pending = null;
  }

  return Object.freeze({
    cancel,
    current: () => current,
    /** @param {AnimatedCue | null} cue */
    isCompletion: (cue) => cue !== null && COMPLETION.has(cue),
    playPending,
    request,
  });
}

export { create };
