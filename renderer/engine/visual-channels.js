// @ts-check
/* 视觉通道运行时。独立管理形变、装饰、粒子、相机和徽标的过渡状态。 */
/**
 * @typedef {Omit<import("../types.js").VisualFrame, "formBlend" | "formMix" | "decorationBlend" | "decorationMix" | "cameraBlend" | "cameraMix" | "notify" | "humDots" | "formTurn"> & { formBlend: import("../types.js").Spring, formMix: import("../types.js").Spring, decorationBlend: import("../types.js").Spring, decorationMix: import("../types.js").Spring, cameraBlend: import("../types.js").Spring, cameraMix: import("../types.js").Spring, notify: import("../types.js").Spring, humDots: import("../types.js").Spring, formTurn: import("../types.js").Spring, formTurnAccumulator: number, formTurnDirection: number, formVisible: boolean, formTarget: string | null, formRest: boolean, formRestAt: number }} VisualState
 * @param {{ effects: { CYCLE: ReadonlySet<string>, CYCLE_ON: Record<string, number>, CYCLE_OFF: number }, math: import("../types.js").MathPort, renderer: Pick<import("../types.js").RendererPort, "resetInk" | "resetPlayback">, springs: { notify: [number, number], humDots: [number, number], visual: [number, number], visualMix: [number, number], formTurn: [number, number] }, now: number }} options
 */
function create(options) {
  const { effects, math, renderer, springs } = options;
  const { sign, spring, stepSpring } = math;
  /** @type {VisualState} */
  const state = {
    formState: null,
    decorationState: null,
    particleState: null,
    cameraState: null,
    badgeState: null,
    formAt: options.now,
    decorationAt: options.now,
    particleAt: options.now,
    formBlend: spring(0),
    formMix: spring(1),
    decorationBlend: spring(0),
    decorationMix: spring(1),
    cameraBlend: spring(0),
    cameraMix: spring(1),
    notify: spring(0),
    humDots: spring(0),
    formTurn: spring(0),
    formTurnAccumulator: 0,
    formTurnDirection: 1,
    formVisible: false,
    formTarget: null,
    formKind: null,
    formPrev: null,
    decoKind: null,
    decoPrev: null,
    cameraKind: null,
    cameraPrev: null,
    formRest: false,
    formRestAt: 0,
    formOverlayAt: 0,
  };

  /** @param {import("../types.js").Spring} value @param {number} target */
  const resetSpring = (value, target) => {
    value.x = target;
    value.t = target;
    value.v = 0;
  };

  /** @param {import("../types.js").ResolvedScene} scene */
  function differs(scene) {
    return (
      scene.form !== state.formState ||
      scene.decoration !== state.decorationState ||
      scene.particles !== state.particleState ||
      scene.camera !== state.cameraState ||
      scene.badge !== state.badgeState
    );
  }

  /** @param {import("../types.js").ResolvedScene} scene @param {number} now @param {boolean} restart */
  function apply(scene, now, restart) {
    const formChanged = scene.form !== state.formState;
    const decorationChanged = scene.decoration !== state.decorationState;
    const particleChanged = scene.particles !== state.particleState;
    state.formState = scene.form;
    state.decorationState = scene.decoration;
    state.particleState = scene.particles;
    state.cameraState = scene.camera;
    state.badgeState = scene.badge;
    if ((formChanged || restart) && scene.form !== null) state.formAt = now;
    if ((decorationChanged || restart) && scene.decoration !== null)
      state.decorationAt = now;
    if ((particleChanged || restart) && scene.particles !== null)
      state.particleAt = now;
    if (
      (decorationChanged || restart) &&
      scene.decoration !== null &&
      scene.decoration !== "pencil"
    ) {
      renderer.resetInk();
    }
  }

  function resetPlayback() {
    /** @type {Array<[import("../types.js").Spring, number]>} */
    const springTargets = [
      [state.formBlend, 0],
      [state.formMix, 1],
      [state.decorationBlend, 0],
      [state.decorationMix, 1],
      [state.cameraBlend, 0],
      [state.cameraMix, 1],
      [state.notify, 0],
      [state.humDots, 0],
      [state.formTurn, 0],
    ];
    for (const [value, target] of springTargets) resetSpring(value, target);
    state.formTurnAccumulator = 0;
    state.formVisible = false;
    state.formKind = null;
    state.formPrev = null;
    state.formTarget = null;
    state.decoKind = null;
    state.decoPrev = null;
    state.cameraKind = null;
    state.cameraPrev = null;
    state.formRest = false;
    state.formRestAt = 0;
    renderer.resetPlayback();
  }

  /** @param {number} now @param {boolean} reduceMotion */
  function prepare(now, reduceMotion) {
    const want = state.formState;
    if (want !== state.formTarget) {
      state.formTarget = want;
      state.formOverlayAt = now;
      state.formRest = false;
      state.formRestAt = 0;
    }
    let on = want !== null;
    if (want && effects.CYCLE.has(want)) {
      if (
        !state.formRest &&
        now - state.formOverlayAt > (effects.CYCLE_ON[want] ?? 0)
      ) {
        state.formRest = true;
        state.formRestAt = now;
      } else if (
        state.formRest &&
        now - state.formRestAt > effects.CYCLE_OFF
      ) {
        state.formRest = false;
        state.formOverlayAt = now;
      }
      on = !state.formRest;
    }
    state.formBlend.t = on ? 1 : 0;
    if (on !== state.formVisible) {
      if (!reduceMotion) {
        if (on) state.formTurnDirection = sign();
        state.formTurnAccumulator += Math.PI * state.formTurnDirection;
        state.formTurn.t = state.formTurnAccumulator;
      }
      state.formVisible = on;
    }
    if (want && want !== state.formKind) {
      if (state.formKind && state.formBlend.x > 0.02) {
        state.formPrev = state.formKind;
        state.formMix.x = 0;
        state.formMix.v = 0;
        state.formMix.t = 1;
      } else {
        state.formPrev = null;
        state.formMix.x = 1;
        state.formMix.v = 0;
        state.formMix.t = 1;
      }
      state.formKind = want;
      state.formOverlayAt = now;
      if (want !== "pencil") renderer.resetInk();
    }
    if (!want && state.formBlend.x < 0.004) {
      if (state.formKind === "pencil" || state.formPrev === "pencil")
        renderer.resetInk();
      state.formKind = null;
      state.formPrev = null;
    }

    const decoration =
      state.decorationState === "hum-dots" ? null : state.decorationState;
    const decorationOn =
      decoration !== null && (decoration !== "gather" || on);
    state.decorationBlend.t = decorationOn ? 1 : 0;
    if (decoration && decoration !== state.decoKind) {
      if (state.decoKind && state.decorationBlend.x > 0.02) {
        state.decoPrev = state.decoKind;
        state.decorationMix.x = 0;
        state.decorationMix.v = 0;
      } else {
        state.decoPrev = null;
        state.decorationMix.x = 1;
        state.decorationMix.v = 0;
      }
      state.decorationMix.t = 1;
      state.decoKind = decoration;
    }
    if (!decoration && state.decorationBlend.x < 0.004) {
      state.decoKind = null;
      state.decoPrev = null;
    }

    const camera = state.cameraState;
    state.cameraBlend.t = camera && (camera !== "gather" || on) ? 1 : 0;
    if (camera && camera !== state.cameraKind) {
      if (state.cameraKind && state.cameraBlend.x > 0.02) {
        state.cameraPrev = state.cameraKind;
        state.cameraMix.x = 0;
        state.cameraMix.v = 0;
      } else {
        state.cameraPrev = null;
        state.cameraMix.x = 1;
        state.cameraMix.v = 0;
      }
      state.cameraMix.t = 1;
      state.cameraKind = camera;
    }
    if (!camera && state.cameraBlend.x < 0.004) {
      state.cameraKind = null;
      state.cameraPrev = null;
    }
    if (state.formMix.x > 0.996) state.formPrev = null;
    if (state.decorationMix.x > 0.996) state.decoPrev = null;
    if (state.cameraMix.x > 0.996) state.cameraPrev = null;
  }

  /** @param {number} step */
  function integrate(step) {
    stepSpring(state.notify, ...springs.notify, step);
    stepSpring(state.humDots, ...springs.humDots, step);
    stepSpring(state.formBlend, ...springs.visual, step);
    stepSpring(state.formMix, ...springs.visualMix, step);
    stepSpring(state.decorationBlend, ...springs.visual, step);
    stepSpring(state.decorationMix, ...springs.visualMix, step);
    stepSpring(state.cameraBlend, ...springs.visual, step);
    stepSpring(state.cameraMix, ...springs.visualMix, step);
    stepSpring(state.formTurn, ...springs.formTurn, step);
  }

  /** @param {boolean} reduceMotion */
  function finishFrame(reduceMotion) {
    if (reduceMotion) {
      state.formMix.x = 1;
      state.decorationMix.x = 1;
      state.cameraMix.x = 1;
      state.formTurn.x = state.formTurn.t;
      state.formBlend.x = state.formBlend.t;
      state.decorationBlend.x = state.decorationBlend.t;
      state.cameraBlend.x = state.cameraBlend.t;
    }
    state.notify.t = state.badgeState === "notification" ? 1 : 0;
    state.humDots.t = state.decorationState === "hum-dots" ? 1 : 0;
  }

  /** @returns {Readonly<import("../types.js").VisualFrame>} */
  function snapshot() {
    return Object.freeze({
      formState: state.formState,
      decorationState: state.decorationState,
      particleState: state.particleState,
      cameraState: state.cameraState,
      badgeState: state.badgeState,
      formAt: state.formAt,
      decorationAt: state.decorationAt,
      particleAt: state.particleAt,
      formBlend: state.formBlend,
      formMix: state.formMix,
      decorationBlend: state.decorationBlend,
      decorationMix: state.decorationMix,
      cameraBlend: state.cameraBlend,
      cameraMix: state.cameraMix,
      notify: state.notify,
      humDots: state.humDots,
      formTurn: state.formTurn,
      formKind: state.formKind,
      formPrev: state.formPrev,
      decoKind: state.decoKind,
      decoPrev: state.decoPrev,
      cameraKind: state.cameraKind,
      cameraPrev: state.cameraPrev,
      formOverlayAt: state.formOverlayAt,
    });
  }

  return Object.freeze({
    apply,
    differs,
    finishFrame,
    form: () => state.formState,
    integrate,
    particleAt: () => state.particleAt,
    particles: () => state.particleState,
    prepare,
    resetPlayback,
    snapshot,
  });
}

export { create };
