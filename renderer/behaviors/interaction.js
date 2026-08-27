// @ts-check
/* 用户交互行为。把指针接触展开为拖动、惊醒、询问和完全唤醒时间线。 */
const STARTLED_MS = 650;
const QUIZZICAL_MS = 2200;

/**
 * @typedef {{ visualOnly: true } | { visualOnly: false, depth: import("../types.js").IdleDepth | null, fullWake: boolean, idle: boolean, pointerDown: boolean, stage: "startled" | "dragging" | "quizzical" }} InteractionState
 * @param {{ getActivity: () => import("../types.js").Activity, idle: import("../types.js").IdlePort, interrupt: () => void, now: () => number, presenter: import("../types.js").PresenterPort, presets: import("../types.js").PresetCatalog, returnToActivity: () => void, scenes: typeof import("../catalog/presets.js").scenes, sequences: { fullWake(direction: number): readonly import("../types.js").TimelineStep[] }, timeline: import("../types.js").Timeline, viewportWidth: () => number }} options
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

  function finishFullWake() {
    current = null;
    if (getActivity() === "idle") returnToActivity();
  }

  function startFullWake() {
    idle.reset(now());
    const direction = idle.chooseDirection("wake-stretch");
    timeline.play("interaction", sequences.fullWake(direction), {
      onComplete: finishFullWake,
    });
  }

  function finishQuizzical() {
    if (!current || current.visualOnly || getActivity() !== "idle") {
      current = null;
      returnToActivity();
      return;
    }
    if (current.fullWake) {
      startFullWake();
      return;
    }
    if (current.depth === "sleeping") idle.recoverFromSleep();
    current = null;
    returnToActivity();
  }

  function beginQuizzical() {
    if (!current || current.visualOnly || getActivity() !== "idle") {
      current = null;
      returnToActivity();
      return;
    }
    current.stage = "quizzical";
    presenter.setGazeTarget(null);
    const direction = idle.chooseDirection("quizzical");
    timeline.play(
      "interaction",
      [
        {
          scene: presets.withDetails(scenes.quizzical, { direction }),
          duration: QUIZZICAL_MS,
        },
      ],
      { onComplete: finishQuizzical },
    );
  }

  function finishStartled() {
    if (
      !current ||
      current.visualOnly ||
      current.stage !== "startled" ||
      getActivity() !== "idle"
    )
      return;
    presenter.setGazeTarget(null);
    if (current.pointerDown) {
      current.stage = "dragging";
      presenter.setScene(scenes.dragging);
    } else {
      beginQuizzical();
    }
  }

  /** @param {import("../types.js").PointerPoint} contact @param {boolean} protectedMode */
  function start(contact, protectedMode) {
    if (protectedMode) {
      current = { visualOnly: true };
      presenter.setOverride(scenes.dragging);
      return;
    }

    const idleInteraction = getActivity() === "idle";
    const depth = idleInteraction ? idle.depthAt(now()) : null;
    current = {
      depth,
      fullWake: idleInteraction && idle.recordPoke(),
      idle: idleInteraction,
      pointerDown: true,
      stage: depth === "sleeping" ? "startled" : "dragging",
      visualOnly: false,
    };
    interrupt();
    if (depth === "sleeping") {
      presenter.setGazeTarget(contact);
      timeline.play(
        "interaction",
        [
          {
            scene: presets.withDetails(scenes.startled, {
              direction: contactDirection(contact.x),
            }),
            duration: STARTLED_MS,
          },
        ],
        { onComplete: finishStartled },
      );
    } else {
      presenter.setScene(scenes.dragging);
    }
  }

  function end() {
    if (!current) return;
    if (current.visualOnly) {
      current = null;
      presenter.clearOverride();
      return;
    }
    current.pointerDown = false;
    if (!current.idle || getActivity() !== "idle") {
      current = null;
      returnToActivity();
      return;
    }
    if (current.stage !== "startled") beginQuizzical();
  }

  function cancel() {
    if (!current) return;
    current = null;
    timeline.cancel("interaction");
    presenter.clearOverride();
    presenter.setGazeTarget(null);
  }

  return Object.freeze({
    cancel,
    end,
    isActive: () => current !== null,
    start,
  });
}

export { create };
