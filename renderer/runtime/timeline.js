// @ts-check
/* 有限动画时间线。只推进步骤、循环和取消，不选择行为或操作渲染器。 */
/**
 * @param {{ scheduler: import("../types.js").Scheduler, enterStep: (step: import("../types.js").TimelineStep) => void }} options
 * @returns {import("../types.js").Timeline}
 */
function create(options) {
  const { scheduler, enterStep } = options;
  /** @type {{ index: number, loop: boolean, onComplete: (() => void) | undefined, owner: string, steps: readonly import("../types.js").TimelineStep[], timer: number | null, token: number } | null} */
  let active = null;
  let disposed = false;
  let generation = 0;

  /** @param {string} [owner] */
  function cancel(owner) {
    if (!active || (owner !== undefined && active.owner !== owner)) return;
    if (active.timer !== null) scheduler.clearTimeout(active.timer);
    active = null;
    generation += 1;
  }

  /**
   * @param {string} owner
   * @param {readonly import("../types.js").TimelineStep[]} steps
   * @param {import("../types.js").TimelineOptions} options
   */
  function play(owner, steps, options) {
    if (disposed) return;
    if (steps.length === 0) throw new Error(`时间线 ${owner} 不能播放空步骤`);
    cancel();
    const token = ++generation;
    active = {
      index: 0,
      loop: options.loop === true,
      onComplete: options.onComplete,
      owner,
      steps,
      timer: null,
      token,
    };

    const advance = () => {
      const playback = active;
      if (!playback || playback.token !== token || disposed) return;
      if (playback.index >= playback.steps.length) {
        if (playback.loop) playback.index = 0;
        else {
          const onComplete = playback.onComplete;
          active = null;
          onComplete?.();
          return;
        }
      }
      const step = playback.steps[playback.index++];
      if (step === undefined) throw new Error(`时间线 ${owner} 缺少当前步骤`);
      enterStep(step);
      playback.timer = scheduler.setTimeout(advance, step.duration);
    };

    advance();
  }

  function destroy() {
    if (disposed) return;
    cancel();
    disposed = true;
  }

  return Object.freeze({
    cancel,
    destroy,
    play,
  });
}

export { create };
