// @ts-check
/* Host 状态生命周期。集中处理导演退出、切换计时和销毁。 */

/**
 * @param {{ scheduler: import("../types.js").Scheduler, timeline: import("../types.js").Timeline, idle: { stop(): void }, activities: { stop(): void }, cues: { cancel(clearPending?: boolean): void } }} options
 */
function create(options) {
  /** @type {import("../types.js").HostState} */
  let current = "startup";
  /** @type {number | null} */
  let switchTimer = null;
  let disposed = false;

  function clearSwitch() {
    if (switchTimer !== null) options.scheduler.clearTimeout(switchTimer);
    switchTimer = null;
  }

  function leaveCurrent() {
    switch (current) {
      case "startup":
      case "waking":
        options.timeline.cancel("protected");
        break;
      case "switching":
        clearSwitch();
        break;
      case "idle":
        options.idle.stop();
        break;
      case "activity":
        options.activities.stop();
        break;
      case "cue":
        options.cues.cancel();
        break;
      case "interaction":
        options.timeline.cancel("interaction");
        break;
      case "preview":
        options.timeline.cancel("preview");
        break;
    }
  }

  /** @param {import("../types.js").HostState} next */
  function transition(next) {
    if (disposed) return false;
    leaveCurrent();
    current = next;
    return true;
  }

  /** @param {number} delay @param {() => void} onReady */
  function scheduleSwitch(delay, onReady) {
    if (!transition("switching")) return;
    switchTimer = options.scheduler.setTimeout(() => {
      switchTimer = null;
      if (!disposed && current === "switching") onReady();
    }, delay);
  }

  function destroy() {
    if (disposed) return;
    disposed = true;
    clearSwitch();
    options.idle.stop();
    options.activities.stop();
    options.cues.cancel();
    options.timeline.cancel();
  }

  return Object.freeze({
    destroy,
    /** @param {import("../types.js").HostState} state */
    is: (state) => current === state,
    scheduleSwitch,
    transition,
  });
}

export { create };
