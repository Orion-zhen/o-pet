/* 统一动画时钟。页面暂停时同时冻结定时器、动画帧和动画时间。 */
(function (g) {
  function create(options) {
    const timerClock = options.timerClock;
    const frameClock = options.frameClock;
    const rawNow = options.now;
    const timers = new Map();
    const frames = new Map();
    const pauseReasons = new Set();
    let nextId = 1;
    let pausedAt = null;
    let pausedDuration = 0;
    let disposed = false;

    const now = () => {
      const raw = rawNow();
      return raw - pausedDuration - (pausedAt === null ? 0 : raw - pausedAt);
    };

    function armTimer(timer) {
      if (disposed || pauseReasons.size > 0 || timer.nativeHandle !== null)
        return;
      timer.nativeHandle = timerClock.setTimeout(
        () => {
          timer.nativeHandle = null;
          if (!timers.delete(timer.id) || disposed) return;
          timer.callback();
        },
        Math.max(0, timer.due - now()),
      );
    }

    function setTimer(callback, delay) {
      if (disposed) return null;
      const timer = {
        id: nextId++,
        callback,
        due: now() + Math.max(0, delay),
        nativeHandle: null,
      };
      timers.set(timer.id, timer);
      armTimer(timer);
      return timer.id;
    }

    function clearTimer(id) {
      if (id === null) return;
      const timer = timers.get(id);
      if (!timer) return;
      if (timer.nativeHandle !== null)
        timerClock.clearTimeout(timer.nativeHandle);
      timers.delete(id);
    }

    function armFrame(frame) {
      if (disposed || pauseReasons.size > 0 || frame.nativeHandle !== null)
        return;
      frame.nativeHandle = frameClock.requestAnimationFrame(() => {
        frame.nativeHandle = null;
        if (!frames.delete(frame.id) || disposed) return;
        frame.callback(now());
      });
    }

    function requestFrame(callback) {
      if (disposed) return null;
      const frame = { id: nextId++, callback, nativeHandle: null };
      frames.set(frame.id, frame);
      armFrame(frame);
      return frame.id;
    }

    function cancelFrame(id) {
      if (id === null) return;
      const frame = frames.get(id);
      if (!frame) return;
      if (frame.nativeHandle !== null)
        frameClock.cancelAnimationFrame(frame.nativeHandle);
      frames.delete(id);
    }

    function pause(reason) {
      if (disposed || pauseReasons.has(reason)) return;
      const wasRunning = pauseReasons.size === 0;
      pauseReasons.add(reason);
      if (!wasRunning) return;
      pausedAt = rawNow();
      for (const timer of timers.values()) {
        if (timer.nativeHandle !== null)
          timerClock.clearTimeout(timer.nativeHandle);
        timer.nativeHandle = null;
      }
      for (const frame of frames.values()) {
        if (frame.nativeHandle !== null)
          frameClock.cancelAnimationFrame(frame.nativeHandle);
        frame.nativeHandle = null;
      }
    }

    function resume(reason) {
      if (disposed || !pauseReasons.delete(reason) || pauseReasons.size > 0)
        return;
      if (pausedAt !== null) pausedDuration += rawNow() - pausedAt;
      pausedAt = null;
      for (const timer of timers.values()) armTimer(timer);
      for (const frame of frames.values()) armFrame(frame);
    }

    function destroy() {
      if (disposed) return;
      disposed = true;
      for (const timer of timers.values()) {
        if (timer.nativeHandle !== null)
          timerClock.clearTimeout(timer.nativeHandle);
      }
      for (const frame of frames.values()) {
        if (frame.nativeHandle !== null)
          frameClock.cancelAnimationFrame(frame.nativeHandle);
      }
      timers.clear();
      frames.clear();
      pauseReasons.clear();
    }

    return Object.freeze({
      cancelAnimationFrame: cancelFrame,
      clearTimeout: clearTimer,
      destroy,
      now,
      pause,
      requestAnimationFrame: requestFrame,
      resume,
      setTimeout: setTimer,
    });
  }

  g.O_PET_SCHEDULER = Object.freeze({ create });
})(window);
