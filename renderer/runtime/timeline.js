/* 有限动画时间线。只推进步骤、循环和取消，不选择行为或操作渲染器。 */
(function (g) {
  function create(options) {
    const { scheduler, enterStep } = options;
    let active = null;
    let disposed = false;
    let generation = 0;

    function cancel(owner) {
      if (!active || (owner !== undefined && active.owner !== owner))
        return false;
      if (active.timer !== null) scheduler.clearTimeout(active.timer);
      active = null;
      generation += 1;
      return true;
    }

    function play(owner, steps, options = {}) {
      if (disposed || !Array.isArray(steps) || steps.length === 0) return false;
      cancel();
      const token = ++generation;
      active = {
        index: 0,
        loop: options.loop === true,
        onComplete: options.onComplete ?? null,
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
        enterStep(step);
        playback.timer = scheduler.setTimeout(advance, step.duration);
      };

      advance();
      return true;
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

  g.O_PET_TIMELINE = Object.freeze({ create });
})(window);
