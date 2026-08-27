// @ts-check
/* 用户交互行为。把指针接触展开为轻触、抚摸、拖动、惊醒和完全唤醒时间线。 */
import * as steps from "../catalog/timeline-steps.js";
const STARTLED_MS = 650;
const QUIZZICAL_MS = 2200;
const BOOP_MS = 420;
const FRONT_MS = 650;
const PETTING_END_MS = 700;

/**
 * @typedef {"pending" | "tap" | "petting" | "dragging"} Gesture
 * @typedef {"pressed" | "startled" | "petting" | "dragging" | "response"} Stage
 * @typedef {{ visualOnly: true, contact: import("../types.js").PointerPoint, gesture: Gesture } | { visualOnly: false, contact: import("../types.js").PointerPoint, depth: import("../types.js").IdleDepth | null, fullWake: boolean, gesture: Gesture, idle: boolean, pointerDown: boolean, stage: Stage }} InteractionState
 * @param {{ getActivity: () => import("../types.js").Activity, idle: import("../types.js").IdlePort, interrupt: () => void, now: () => number, presenter: import("../types.js").PresenterPort, presets: import("../types.js").PresetCatalog, returnToActivity: () => void, scenes: typeof import("../catalog/presets.js").scenes, sequences: { fullWake(direction: number): readonly import("../types.js").TimelineStep[], tapPlay(direction: number): readonly import("../types.js").TimelineStep[] }, timeline: import("../types.js").Timeline, viewportWidth: () => number }} options
 */
function create(options) {
  const {
    getActivity,
    idle,
    interrupt,
    now,
    presenter,
    presets,
    returnToActivity,
    scenes,
    sequences,
    timeline,
    viewportWidth,
  } = options;
  /** @type {InteractionState | null} */
  let current = null;

  /** @param {number} clientX */
  function contactDirection(clientX) {
    return clientX < viewportWidth() / 2 ? 1 : -1;
  }

  /** @param {InteractionState} state */
  const isCurrent = (state) => current === state;

  /** @param {InteractionState & { visualOnly: false }} state */
  function finishToActivity(state) {
    if (!isCurrent(state)) return;
    if (state.depth === "sleeping") idle.recoverFromSleep();
    current = null;
    returnToActivity();
  }

  /** @param {InteractionState & { visualOnly: false }} state */
  function finishFullWake(state) {
    if (!isCurrent(state)) return;
    current = null;
    if (getActivity() === "idle") returnToActivity();
  }

  /** @param {InteractionState & { visualOnly: false }} state */
  function startFullWake(state) {
    if (!isCurrent(state)) return;
    idle.reset(now());
    state.stage = "response";
    const direction = idle.chooseDirection("wake-stretch");
    timeline.play("interaction", sequences.fullWake(direction), {
      onComplete: () => finishFullWake(state),
    });
  }

  /** @param {InteractionState & { visualOnly: false }} state */
  function startTapPlay(state) {
    if (!isCurrent(state)) return;
    state.stage = "response";
    const direction = idle.chooseDirection("tap-play");
    timeline.play("interaction", sequences.tapPlay(direction), {
      onComplete: () => finishToActivity(state),
    });
  }

  /** @param {InteractionState & { visualOnly: false }} state */
  function finishTap(state) {
    if (!isCurrent(state)) return;
    if (state.fullWake && state.idle) {
      if (state.depth === "drowsy" || state.depth === "sleeping")
        startFullWake(state);
      else startTapPlay(state);
      return;
    }
    finishToActivity(state);
  }

  /** @param {InteractionState & { visualOnly: false }} state */
  function startTap(state) {
    if (!isCurrent(state)) return;
    state.stage = "response";
    const direction = contactDirection(state.contact.x);
    presenter.setGazeTarget(state.contact);
    timeline.play(
      "interaction",
      [
        steps.scene(
          presets.withDetails(scenes.booped, { direction }),
          BOOP_MS,
        ),
      ],
      {
        onComplete() {
          if (!isCurrent(state)) return;
          presenter.setGazeTarget(null);
          timeline.play("interaction", [steps.scene(scenes.front, FRONT_MS)], {
            onComplete: () => finishTap(state),
          });
        },
      },
    );
  }

  /** @param {InteractionState & { visualOnly: false }} state */
  function finishQuizzical(state) {
    if (!isCurrent(state)) return;
    if (state.fullWake) {
      startFullWake(state);
      return;
    }
    finishToActivity(state);
  }

  /** @param {InteractionState & { visualOnly: false }} state */
  function beginQuizzical(state) {
    if (!isCurrent(state) || getActivity() !== "idle") {
      if (isCurrent(state)) {
        current = null;
        returnToActivity();
      }
      return;
    }
    state.stage = "response";
    presenter.setGazeTarget(null);
    const direction = idle.chooseDirection("quizzical");
    timeline.play(
      "interaction",
      [
        steps.scene(
          presets.withDetails(scenes.quizzical, { direction }),
          QUIZZICAL_MS,
        ),
      ],
      { onComplete: () => finishQuizzical(state) },
    );
  }

  /** @param {InteractionState & { visualOnly: false }} state */
  function finishStartled(state) {
    if (!isCurrent(state) || state.stage !== "startled") return;
    presenter.setGazeTarget(null);
    if (!state.pointerDown) {
      beginQuizzical(state);
      return;
    }
    if (state.gesture === "dragging") {
      state.stage = "dragging";
      presenter.setScene(scenes.dragging);
    }
  }

  /** @param {import("../types.js").PointerPoint} contact @param {boolean} protectedMode */
  function start(contact, protectedMode) {
    const direction = contactDirection(contact.x);
    if (protectedMode) {
      current = { contact, gesture: "pending", visualOnly: true };
      presenter.setGazeTarget(contact);
      presenter.setOverride(
        presets.withDetails(scenes.touched, { direction }),
      );
      return;
    }

    const idleInteraction = getActivity() === "idle";
    const depth = idleInteraction ? idle.depthAt(now()) : null;
    const state = /** @type {InteractionState & { visualOnly: false }} */ ({
      contact,
      depth,
      fullWake: false,
      gesture: "pending",
      idle: idleInteraction,
      pointerDown: true,
      stage: depth === "sleeping" ? "startled" : "pressed",
      visualOnly: false,
    });
    current = state;
    interrupt();
    presenter.setGazeTarget(contact);
    if (depth === "sleeping") {
      timeline.play(
        "interaction",
        [
          steps.scene(
            presets.withDetails(scenes.startled, { direction }),
            STARTLED_MS,
          ),
        ],
        { onComplete: () => finishStartled(state) },
      );
    } else {
      presenter.setScene(presets.withDetails(scenes.touched, { direction }));
    }
  }

  /** @param {"petting" | "dragging"} gesture */
  function classify(gesture) {
    const state = current;
    if (!state) return;
    state.gesture = gesture;
    if (state.visualOnly) {
      presenter.setGazeTarget(gesture === "petting" ? state.contact : null);
      presenter.setOverride(
        gesture === "petting"
          ? presets.withDetails(scenes.petting, {
              direction: contactDirection(state.contact.x),
            })
          : scenes.dragging,
      );
      return;
    }
    if (gesture === "petting") {
      timeline.cancel("interaction");
      state.stage = "petting";
      presenter.setGazeTarget(state.contact);
      presenter.setScene(
        presets.withDetails(scenes.petting, {
          direction: contactDirection(state.contact.x),
        }),
      );
      return;
    }
    presenter.setGazeTarget(null);
    if (state.stage === "startled") return;
    state.stage = "dragging";
    presenter.setScene(scenes.dragging);
  }

  /** @param {"tap" | "petting" | "dragging"} gesture */
  function end(gesture) {
    const state = current;
    if (!state) return;
    state.gesture = gesture;
    if (state.visualOnly) {
      current = null;
      presenter.setGazeTarget(null);
      presenter.clearOverride();
      return;
    }
    state.pointerDown = false;
    if (gesture === "tap") {
      if (state.idle) state.fullWake = idle.recordPoke();
      if (state.stage !== "startled") startTap(state);
      return;
    }
    if (gesture === "petting") {
      state.stage = "response";
      presenter.setGazeTarget(null);
      timeline.play(
        "interaction",
        [steps.scene(scenes.happy, PETTING_END_MS)],
        { onComplete: () => finishToActivity(state) },
      );
      return;
    }
    if (!state.idle || getActivity() !== "idle") {
      current = null;
      returnToActivity();
      return;
    }
    if (state.stage !== "startled") beginQuizzical(state);
  }

  function abort() {
    const state = current;
    if (!state) return;
    current = null;
    timeline.cancel("interaction");
    presenter.setGazeTarget(null);
    if (state.visualOnly) {
      presenter.clearOverride();
      return;
    }
    returnToActivity();
  }

  function cancel() {
    if (!current) return;
    current = null;
    timeline.cancel("interaction");
    presenter.clearOverride();
    presenter.setGazeTarget(null);
  }

  return Object.freeze({
    abort,
    cancel,
    classify,
    end,
    isActive: () => current !== null,
    start,
  });
}

export { create };
