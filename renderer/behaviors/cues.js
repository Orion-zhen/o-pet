/* 瞬态 Cue 导演。独立管理优先级、排队和有限序列。 */
(function (g) {
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
  const COMPLETION = new Set([
    "completed_quick",
    "completed_normal",
    "completed_hard",
    "run_failed",
    "run_aborted",
  ]);

  function create(options) {
    const { sequences, timeline } = options;
    let current = null;
    let pending = null;
    let onFinished = options.onFinished;

    const priority = (cue) => PRIORITY[cue];

    function queue(cue) {
      if (!pending || priority(cue) > priority(pending)) pending = cue;
    }

    function play(cue) {
      const steps = sequences[cue];
      if (!steps) return false;
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
      return true;
    }

    function request(cue, protectedMode = false) {
      if (protectedMode) {
        queue(cue);
        return "queued";
      }
      if (current !== null) {
        if (current === "reply_sent" && COMPLETION.has(cue)) {
          pending = cue;
          return "queued";
        }
        if (priority(cue) > priority(current)) {
          play(cue);
          return "playing";
        }
        queue(cue);
        return "queued";
      }
      play(cue);
      return "playing";
    }

    function playPending() {
      if (pending === null) return false;
      const cue = pending;
      pending = null;
      return play(cue);
    }

    function cancel(clearPending = true) {
      timeline.cancel("cue");
      current = null;
      if (clearPending) pending = null;
    }

    return Object.freeze({
      cancel,
      current: () => current,
      hasPending: () => pending !== null,
      isCompletion: (cue) => COMPLETION.has(cue),
      playPending,
      request,
      setOnFinished(callback) {
        onFinished = callback;
      },
    });
  }

  g.O_PET_CUES = Object.freeze({ COMPLETION, PRIORITY, create });
})(globalThis[Symbol.for("o-pet.renderer")]);
