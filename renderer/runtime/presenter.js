// @ts-check
/* 场景呈现端口。统一维护基础场景、临时覆盖和一次性动作。 */
/**
 * @param {{ character: import("../types.js").CharacterPort, presets: import("../types.js").PresetCatalog, initialScene: import("../types.js").Scene }} options
 */
function create(options) {
  const { character, presets } = options;
  let currentScene = options.initialScene;
  /** @type {import("../types.js").Scene | null} */
  let overrideScene = null;
  let suspended = false;
  let restartOnReveal = false;
  let disposed = false;

  /** @param {import("../types.js").Scene} scene @param {boolean} restart */
  function apply(scene, restart) {
    if (restart) character.playPreset(scene);
    else character.setPreset(scene, { resetEyes: false });
  }

  /** @param {import("../types.js").Scene} scene @param {boolean} restart */
  function setBaseScene(scene, restart) {
    currentScene = scene;
    restartOnReveal = restart;
    if (overrideScene !== null) return;
    apply(scene, restart);
    restartOnReveal = false;
  }

  /** @param {import("../types.js").Scene} scene */
  function setScene(scene) {
    if (disposed || currentScene === scene) return;
    setBaseScene(scene, false);
  }

  /** @param {import("../types.js").Scene} scene */
  function setOverride(scene) {
    if (disposed) return;
    overrideScene = scene;
    apply(scene, false);
    if (suspended) character.setPaused(false);
  }

  function clearOverride() {
    if (disposed || overrideScene === null) return;
    overrideScene = null;
    if (suspended) character.setPaused(true);
    apply(currentScene, restartOnReveal);
    restartOnReveal = false;
    if (suspended) character.renderOnce();
  }

  /** @param {import("../types.js").Scene} scene */
  function withReaction(scene) {
    const base = "preset" in currentScene ? currentScene.preset : currentScene;
    const reaction = "preset" in scene ? scene.preset : scene;
    return presets.replaceChannels(base, reaction, [
      "motion",
      "face",
      "expression",
      "gaze",
    ]);
  }

  /** @param {readonly import("../types.js").TimelineEvent[]} events */
  function trigger(events) {
    for (const event of events) {
      switch (event.kind) {
        case "wink":
          character.winkOnce();
          break;
        case "spin":
          character.spinOnce(event.turns, event.direction);
          break;
        case "hop":
          character.hopOnce();
          break;
        case "pounce":
          character.pounceOnce(event.direction, event.strength);
          break;
      }
    }
  }

  /** @param {import("../types.js").TimelineStep} step */
  function enterStep(step) {
    if (disposed) return;
    if (step.kind === "pause") {
      suspended = true;
      if (overrideScene === null) character.setPaused(true);
      return;
    }
    if (step.kind === "state") {
      setBaseScene(presets.fromState(step.state), true);
    } else {
      const scene = step.preserveEffect
        ? withReaction(step.scene)
        : step.scene;
      if (step.restart === true) setBaseScene(scene, true);
      else setScene(scene);
      trigger(step.events ?? []);
    }
    if (suspended) {
      suspended = false;
      character.setPaused(false);
    }
  }

  /** @param {import("../types.js").PointerPoint | null} target */
  function setGazeTarget(target) {
    if (!disposed) character.setGazeTarget(target);
  }

  function destroy() {
    if (disposed) return;
    disposed = true;
    overrideScene = null;
    restartOnReveal = false;
  }

  return Object.freeze({
    clearOverride,
    destroy,
    enterStep,
    setGazeTarget,
    setOverride,
    setScene,
  });
}

export { create };
