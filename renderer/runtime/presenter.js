/* 场景呈现端口。统一维护基础场景、临时覆盖和一次性动作。 */
(function (g) {
  function create(options) {
    const { character, presets } = options;
    let currentScene = options.initialScene;
    let overrideScene = null;
    let suspended = false;
    let disposed = false;

    function apply(scene, restart) {
      if (restart) character.playPreset(scene);
      else character.setPreset(scene, { resetEyes: false });
    }

    function setScene(scene) {
      if (disposed || currentScene === scene) return;
      currentScene = scene;
      if (overrideScene === null) apply(scene, false);
    }

    function setOverride(scene) {
      if (disposed) return;
      overrideScene = scene;
      apply(scene, false);
    }

    function clearOverride() {
      if (disposed || overrideScene === null) return;
      overrideScene = null;
      apply(currentScene, false);
    }

    function withReaction(scene) {
      const base = currentScene.preset ?? currentScene;
      const reaction = scene.preset ?? scene;
      return presets.replaceChannels(base, reaction, [
        "motion",
        "face",
        "expression",
        "gaze",
      ]);
    }

    function trigger(step) {
      if (step.wink) character.winkOnce();
      if (step.spin) character.spinOnce(step.spin.turns, step.spin.direction);
      if (step.hop) character.hopOnce();
      if (step.pounce)
        character.pounceOnce(step.pounce.direction, step.pounce.strength);
    }

    function enterStep(step) {
      if (disposed) return;
      if (step.pause === true) {
        suspended = true;
        character.setPaused(true);
        return;
      }
      if (step.state !== undefined) {
        currentScene = presets.fromState(step.state);
        character.playPreset(currentScene);
      } else if (step.scene !== undefined) {
        const scene = step.preserveEffect
          ? withReaction(step.scene)
          : step.scene;
        if (step.restart === true) {
          currentScene = scene;
          if (overrideScene === null) apply(scene, true);
        } else {
          setScene(scene);
        }
      }
      trigger(step);
      if (suspended) {
        suspended = false;
        character.setPaused(false);
      }
    }

    function setGazeTarget(target) {
      if (!disposed) character.setGazeTarget(target);
    }

    function destroy() {
      if (disposed) return;
      disposed = true;
      overrideScene = null;
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

  g.O_PET_PRESENTER = Object.freeze({ create });
})(window);
