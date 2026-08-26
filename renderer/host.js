/* o-pet 组合根。只协调行为优先级、外部事件和模块生命周期。 */
(function (g) {
  const ACTIVITIES = Object.freeze({
    idle: true,
    thinking: true,
    searching: true,
    coding: true,
    terminal: true,
    receiving: true,
    consulting: true,
    tooling: true,
    replying: true,
    awaiting_approval: true,
  });
  const CUES = g.O_PET_CUES.PRIORITY;
  const ACTIONS = new Set(
    g.O_PET_ACTION_GROUPS.flatMap((group) => group.states),
  );
  const hasOwn = (value, key) =>
    Object.prototype.hasOwnProperty.call(value, key);
  const STARTUP_MS = 2000;
  const WAKING_MS = 1800;
  const ACTIVITY_SETTLE_MS = 350;
  const ACTION_PLAY_MS = 3000;
  const ACTION_PAUSE_MS = 1000;

  function create(options) {
    const doc = options.document;
    const timerClock = options.clock;
    const frameClock = options.frameClock;
    const rawNow = options.now;
    const random = options.random;
    const motionQuery = options.motionQuery;
    const viewportWidth = options.viewportWidth;
    const scheduler = g.O_PET_SCHEDULER.create({
      timerClock,
      frameClock,
      now: rawNow,
    });
    const now = scheduler.now;
    const presets = g.OPET_PRESETS;
    const tables = g.OPET_TABLES.create(g.OPET_GEO, g.O_PET_ACTION_GROUPS);
    const scenes = presets.scenes;
    const sequences = g.OPET_SEQUENCES.create(presets);
    const math = g.OPET_MATH.create(random);
    const geometry = g.OPET_GEOMETRY.create({ data: g.OPET_GEO, math });
    const effects = g.OPET_EFFECTS.create({ data: g.OPET_GEO, math });
    const eyes = g.OPET_EYES.create({ geometry, math }, random);
    const character = g.O_PET_RUNTIME.create(
      {
        actions: g.OPET_ACTIONS,
        choreography: g.OPET_CHOREOGRAPHY,
        data: g.OPET_GEO,
        effects,
        expression: g.OPET_EXPRESSION,
        eyes,
        gaze: g.OPET_GAZE,
        geometry,
        math,
        motion: g.OPET_MOTION,
        presets,
        tables,
        visualChannels: g.O_PET_VISUAL_CHANNELS,
      },
      {
        clock: scheduler,
        color: "black",
        createRenderer: () =>
          g.OPET_RENDER.create(
            {
              data: g.OPET_GEO,
              effects,
              eyes,
              geometry,
              math,
              particles: g.OPET_PARTICLES,
              tables,
            },
            {
              document: doc,
              initialShape: "blob",
              rand: math.rand,
              random,
              svg: options.svg,
            },
          ),
        followPointer: true,
        math,
        random,
        shape: "blob",
        state: "spawning",
      },
    );
    const presenter = g.O_PET_PRESENTER.create({
      character,
      initialScene: scenes.spawning,
      presets,
    });
    const timeline = g.O_PET_TIMELINE.create({
      scheduler,
      enterStep: presenter.enterStep,
    });
    const activities = g.O_PET_ACTIVITIES.create({
      now,
      random,
      scenes,
      timeline,
    });
    const idle = g.O_PET_IDLE.create({
      now,
      presets,
      random,
      scenes,
      timeline,
    });
    const cues = g.O_PET_CUES.create({
      sequences: sequences.cues,
      timeline,
      onFinished: enterActivity,
    });
    const preferences = g.O_PET_PREFERENCES.create({
      character,
      geometry: g.OPET_GEO,
      motionQuery,
    });

    let activity = "idle";
    let activityAt = now();
    let state = Object.freeze({ kind: "startup" });
    let wakeBeforeActivity = false;
    let switchTimer = null;
    let destroyed = false;

    function setState(kind) {
      state = Object.freeze({ kind });
    }

    function clearSwitch() {
      if (switchTimer !== null) scheduler.clearTimeout(switchTimer);
      switchTimer = null;
    }

    function stopDirector() {
      if (state.kind === "idle") idle.stop();
      else if (state.kind === "activity") activities.stop();
      else if (state.kind === "cue") cues.cancel(false);
      else if (state.kind === "interaction") timeline.cancel("interaction");
    }

    function enterActivity() {
      if (destroyed) return;
      clearSwitch();
      presenter.setGazeTarget(null);
      wakeBeforeActivity = false;
      if (activity === "idle") {
        setState("idle");
        idle.start();
      } else {
        setState("activity");
        activities.start(activity, activityAt);
      }
    }

    function finishProtected() {
      if (destroyed) return;
      if (cues.playPending()) setState("cue");
      else enterActivity();
    }

    function playWaking() {
      clearSwitch();
      stopDirector();
      presenter.setGazeTarget(null);
      setState("waking");
      timeline.play(
        "protected",
        [{ scene: scenes.waking, duration: WAKING_MS }],
        {
          onComplete: finishProtected,
        },
      );
    }

    function requestCue(cue) {
      if (cue === "progress") {
        activities.progress();
        return;
      }
      if (state.kind === "startup" || state.kind === "waking") {
        cues.request(cue, true);
        return;
      }
      if (state.kind === "cue") {
        cues.request(cue);
        return;
      }
      clearSwitch();
      stopDirector();
      interaction.cancel();
      presenter.clearOverride();
      presenter.setGazeTarget(null);
      setState("cue");
      cues.request(cue);
    }

    function scheduleActivitySwitch() {
      clearSwitch();
      stopDirector();
      setState("switching");
      switchTimer = scheduler.setTimeout(() => {
        switchTimer = null;
        if (activity !== "idle" && wakeBeforeActivity) playWaking();
        else enterActivity();
      }, ACTIVITY_SETTLE_MS);
    }

    function update(next) {
      if (
        destroyed ||
        state.kind === "preview" ||
        next === null ||
        typeof next !== "object" ||
        typeof next.activity !== "string" ||
        !hasOwn(ACTIVITIES, next.activity)
      )
        return false;
      const cue = next.cue;
      if (cue !== undefined && (typeof cue !== "string" || !hasOwn(CUES, cue)))
        return false;

      const previousActivity = activity;
      const changed = next.activity !== activity;
      if (changed) {
        if (previousActivity === "idle" && next.activity !== "idle")
          wakeBeforeActivity = idle.leave();
        activity = next.activity;
        activityAt = now();
        if (activity === "idle") idle.reset(activityAt);
        if (activity !== "terminal") activities.resetProgress();
        if (
          activity !== "idle" &&
          state.kind === "cue" &&
          cues.isCompletion(cues.current())
        ) {
          cues.cancel();
          setState("switching");
        }
        if (state.kind === "interaction") interaction.cancel();
      }

      if (activity === "awaiting_approval" && cue === undefined) {
        interaction.cancel();
        enterActivity();
        return true;
      }
      if (typeof cue === "string") {
        if (wakeBeforeActivity && activity !== "idle") {
          cues.request(cue, true);
          playWaking();
        } else {
          requestCue(cue);
        }
        return true;
      }
      if (
        state.kind === "startup" ||
        state.kind === "waking" ||
        state.kind === "cue"
      )
        return true;
      if (changed) scheduleActivitySwitch();
      return true;
    }

    function showAction(name) {
      if (destroyed || typeof name !== "string" || !ACTIONS.has(name))
        return false;
      clearSwitch();
      stopDirector();
      cues.cancel();
      interaction.cancel();
      presenter.clearOverride();
      presenter.setGazeTarget(null);
      setState("preview");
      timeline.play(
        "preview",
        [
          { state: name, duration: ACTION_PLAY_MS },
          { pause: true, duration: ACTION_PAUSE_MS },
        ],
        { loop: true },
      );
      return true;
    }

    const interaction = g.O_PET_INTERACTION.create({
      getActivity: () => activity,
      idle,
      interrupt() {
        clearSwitch();
        stopDirector();
        cues.cancel();
        setState("interaction");
      },
      now,
      presenter,
      presets,
      returnToActivity: enterActivity,
      scenes,
      sequences,
      timeline,
      viewportWidth,
    });

    function onPointerStart(contact) {
      const protectedMode =
        state.kind === "startup" ||
        state.kind === "waking" ||
        state.kind === "preview";
      interaction.start(contact, protectedMode);
    }

    function onPointerEnd() {
      interaction.end();
    }

    function onPointerEnter() {
      if (
        activity === "idle" &&
        !interaction.isActive() &&
        state.kind === "idle"
      )
        idle.hover();
    }

    function onVisibilityChange() {
      if (doc.hidden) scheduler.pause("hidden");
      else scheduler.resume("hidden");
    }

    const pointer = g.O_PET_POINTER.create({
      document: doc,
      frameClock,
      onEnd: onPointerEnd,
      onEnter: onPointerEnter,
      onStart: onPointerStart,
      onTrack: (point) => character.setPointerPosition(point),
      postDrag: options.postDrag,
      target: options.pointerTarget,
    });

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      clearSwitch();
      doc.removeEventListener("visibilitychange", onVisibilityChange);
      pointer.destroy();
      preferences.destroy();
      cues.cancel();
      idle.stop();
      activities.stop();
      interaction.cancel();
      timeline.destroy();
      presenter.destroy();
      character.destroy();
      scheduler.destroy();
    }

    idle.reset(activityAt);
    doc.addEventListener("visibilitychange", onVisibilityChange);
    if (doc.hidden) scheduler.pause("hidden");
    timeline.play(
      "protected",
      [{ scene: scenes.spawning, duration: STARTUP_MS }],
      {
        onComplete: finishProtected,
      },
    );

    return Object.freeze({
      destroy,
      setPreferences: preferences.set,
      showAction,
      update,
    });
  }

  g.OPetRenderer = Object.freeze({ create });
})(globalThis[Symbol.for("o-pet.renderer")]);
