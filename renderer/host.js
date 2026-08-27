// @ts-check
/* o-pet 组合根。只协调行为优先级、外部事件和模块生命周期。 */
import * as O_PET_POINTER from "./adapters/pointer.js";
import * as O_PET_PREFERENCES from "./adapters/preferences.js";
import * as O_PET_ACTIVITIES from "./behaviors/activities.js";
import * as O_PET_CUES from "./behaviors/cues.js";
import * as O_PET_IDLE from "./behaviors/idle.js";
import * as O_PET_INTERACTION from "./behaviors/interaction.js";
import * as OPET_PRESETS from "./catalog/presets.js";
import { create as createRegistry } from "./catalog/registry.js";
import * as OPET_SEQUENCES from "./catalog/sequences.js";
import * as OPET_TABLES from "./catalog/tables.js";
import * as OPET_STEPS from "./catalog/timeline-steps.js";
import * as OPET_VALIDATION from "./catalog/validation.js";
import * as OPET_ACTIONS from "./engine/actions.js";
import * as OPET_CHOREOGRAPHY from "./engine/channels/choreography.js";
import * as OPET_EXPRESSION from "./engine/channels/expression.js";
import * as OPET_GAZE from "./engine/channels/gaze.js";
import * as OPET_MOTION from "./engine/channels/motion.js";
import * as OPET_MATH from "./engine/math.js";
import * as O_PET_FRAME from "./engine/frame.js";
import * as OPET_POINTER_TRACKER from "./engine/pointer-tracker.js";
import * as O_PET_RUNTIME from "./engine/runtime.js";
import * as O_PET_VISUAL_CHANNELS from "./engine/visual-channels.js";
import * as O_PET_HOST_STATE from "./runtime/host-state.js";
import * as O_PET_PRESENTER from "./runtime/presenter.js";
import * as O_PET_SCHEDULER from "./runtime/scheduler.js";
import * as O_PET_TIMELINE from "./runtime/timeline.js";
import * as OPET_EFFECTS from "./view/effects.js";
import * as OPET_EYES from "./view/eyes.js";
import OPET_GEO from "./view/geometry-data.js";
import * as OPET_GEOMETRY from "./view/geometry.js";
import * as OPET_PARTICLES from "./view/particles.js";
import * as OPET_RENDER from "./view/svg.js";

const STARTUP_MS = 2000;
const WAKING_MS = 1800;
const ACTIVITY_SETTLE_MS = 350;
const ACTION_PLAY_MS = 3000;
const ACTION_PAUSE_MS = 1000;

/**
 * @param {import("./types.js").RendererOptions} options
 * @param {import("./types.js").RendererOverrides} [overrides]
 * @returns {import("./types.js").RendererApi}
 */
function create(options, overrides = {}) {
  const runtimeModule = overrides.runtime ?? O_PET_RUNTIME;
  const doc = options.document;
  const timerClock = options.clock;
  const frameClock = options.frameClock;
  const rawNow = options.now;
  const random = options.random;
  const motionQuery = options.motionQuery;
  const viewportWidth = options.viewportWidth;
  const presets = OPET_PRESETS;
  const tables = OPET_TABLES.create();
  OPET_VALIDATION.validate(presets, tables, {
    motion: OPET_MOTION.registry,
    face: OPET_EXPRESSION.registry,
    gaze: OPET_GAZE.registry,
    choreography: OPET_CHOREOGRAPHY.registry,
    shape: createRegistry("shape", Object.keys(OPET_GEO.shapes)),
    form: OPET_EFFECTS.registries.form,
    decoration: OPET_EFFECTS.registries.decoration,
    particles: O_PET_VISUAL_CHANNELS.registries.particles,
    camera: tables.CAMERA_REGISTRY,
    badge: O_PET_VISUAL_CHANNELS.registries.badge,
  });
  const scheduler = O_PET_SCHEDULER.create({
    timerClock,
    frameClock,
    now: rawNow,
  });
  const now = scheduler.now;
  const scenes = presets.scenes;
  const sequences = OPET_SEQUENCES.create(presets);
  const math = OPET_MATH.create(random);
  const geometry = OPET_GEOMETRY.create({ data: OPET_GEO, math });
  const effects = OPET_EFFECTS.create({
    data: OPET_GEO,
    math,
    tables,
  });
  const eyes = OPET_EYES.create({ geometry, math }, random);
  const character = runtimeModule.create(
    {
      actions: OPET_ACTIONS,
      choreography: OPET_CHOREOGRAPHY,
      data: OPET_GEO,
      effects,
      expression: OPET_EXPRESSION,
      frame: O_PET_FRAME,
      eyes,
      gaze: OPET_GAZE,
      geometry,
      math,
      motion: OPET_MOTION,
      presets,
      pointerTracker: OPET_POINTER_TRACKER,
      tables,
      visualChannels: O_PET_VISUAL_CHANNELS,
    },
    {
      clock: scheduler,
      createRenderer: () =>
        OPET_RENDER.create(
          {
            data: OPET_GEO,
            effects,
            eyes,
            geometry,
            math,
            particles: OPET_PARTICLES,
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
      random,
    },
  );
  const presenter = O_PET_PRESENTER.create({
    character,
    initialScene: scenes.spawning,
    presets,
  });
  const timeline = O_PET_TIMELINE.create({
    scheduler,
    enterStep: presenter.enterStep,
  });
  const activities = O_PET_ACTIVITIES.create({
    now,
    random,
    scenes,
    timeline,
  });
  const idle = O_PET_IDLE.create({
    now,
    presets,
    random,
    scenes,
    timeline,
  });
  const cues = O_PET_CUES.create({
    sequences: sequences.cues,
    timeline,
    onFinished: enterActivity,
  });
  const hostState = O_PET_HOST_STATE.create({
    activities,
    cues,
    idle,
    scheduler,
    timeline,
  });
  const preferences = O_PET_PREFERENCES.create({
    character,
    motionQuery,
  });

  /** @type {import("./types.js").Activity} */
  let activity = "idle";
  let activityAt = now();
  let wakeBeforeActivity = false;
  let destroyed = false;

  function enterActivity() {
    if (destroyed) return;
    presenter.setGazeTarget(null);
    wakeBeforeActivity = false;
    if (activity === "idle") {
      hostState.transition("idle");
      idle.start();
    } else {
      hostState.transition("activity");
      activities.start(activity, activityAt);
    }
  }

  function finishProtected() {
    if (destroyed) return;
    if (cues.playPending()) hostState.transition("cue");
    else enterActivity();
  }

  function playWaking() {
    presenter.setGazeTarget(null);
    hostState.transition("waking");
    timeline.play(
      "protected",
      [OPET_STEPS.scene(scenes.waking, WAKING_MS)],
      {
        onComplete: finishProtected,
      },
    );
  }

  /** @param {import("./types.js").Cue} cue */
  function requestCue(cue) {
    if (cue === "progress") {
      activities.progress();
      return;
    }
    if (hostState.is("startup") || hostState.is("waking")) {
      cues.request(cue, true);
      return;
    }
    if (hostState.is("cue")) {
      cues.request(cue);
      return;
    }
    interaction.cancel();
    presenter.clearOverride();
    presenter.setGazeTarget(null);
    hostState.transition("cue");
    cues.request(cue);
  }

  function scheduleActivitySwitch() {
    hostState.scheduleSwitch(ACTIVITY_SETTLE_MS, () => {
      if (activity !== "idle" && wakeBeforeActivity) playWaking();
      else enterActivity();
    });
  }

  /** @param {import("./types.js").RendererUpdate} next */
  function update(next) {
    if (destroyed || hostState.is("preview")) return false;
    const cue = next.cue;

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
        hostState.is("cue") &&
        cues.isCompletion(cues.current())
      ) {
        hostState.transition("switching");
      }
      if (hostState.is("interaction")) interaction.cancel();
    }

    if (activity === "awaiting_approval" && cue === undefined) {
      interaction.cancel();
      enterActivity();
      return true;
    }
    if (cue !== undefined) {
      if (cue === "progress") {
        requestCue(cue);
      } else if (wakeBeforeActivity && activity !== "idle") {
        cues.request(cue, true);
        playWaking();
      } else {
        requestCue(cue);
      }
      return true;
    }
    if (
      hostState.is("startup") ||
      hostState.is("waking") ||
      hostState.is("cue")
    )
      return true;
    if (changed) scheduleActivitySwitch();
    return true;
  }

  /** @param {string} name */
  function showAction(name) {
    if (destroyed) return;
    cues.cancel();
    interaction.cancel();
    presenter.clearOverride();
    presenter.setGazeTarget(null);
    hostState.transition("preview");
    timeline.play(
      "preview",
      [
        OPET_STEPS.state(name, ACTION_PLAY_MS),
        OPET_STEPS.pause(ACTION_PAUSE_MS),
      ],
      { loop: true },
    );
  }

  const interaction = O_PET_INTERACTION.create({
    getActivity: () => activity,
    idle,
    interrupt() {
      hostState.transition("interaction");
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

  /** @param {import("./types.js").PointerPoint} contact */
  function onPointerStart(contact) {
    const protectedMode =
      hostState.is("startup") ||
      hostState.is("waking") ||
      hostState.is("preview");
    interaction.start(contact, protectedMode);
  }

  function onPointerEnd() {
    interaction.end();
  }

  function onPointerEnter() {
    if (
      activity === "idle" &&
      !interaction.isActive() &&
      hostState.is("idle")
    )
      idle.hover();
  }

  function onVisibilityChange() {
    if (doc.hidden) scheduler.pause("hidden");
    else scheduler.resume("hidden");
  }

  const pointer = O_PET_POINTER.create({
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
    doc.removeEventListener("visibilitychange", onVisibilityChange);
    pointer.destroy();
    preferences.destroy();
    presenter.destroy();
    interaction.cancel();
    hostState.destroy();
    timeline.destroy();
    character.destroy();
    scheduler.destroy();
  }

  idle.reset(activityAt);
  doc.addEventListener("visibilitychange", onVisibilityChange);
  if (doc.hidden) scheduler.pause("hidden");
  timeline.play(
    "protected",
    [OPET_STEPS.scene(scenes.spawning, STARTUP_MS)],
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


export { create };
