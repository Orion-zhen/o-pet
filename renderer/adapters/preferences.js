/* 渲染偏好适配器。应用原生配置并管理系统动态偏好监听。 */
(function (g) {
  function create(options) {
    const { character, motionQuery } = options;
    let disposed = false;

    function applyReducedMotion() {
      character.setReduceMotion(motionQuery.matches);
    }

    function set(preferences) {
      if (disposed) return;
      character.setShape(preferences.shape);
      character.setInk(preferences.body_color);
      character.setEyeColor(preferences.eye_color);
    }

    function destroy() {
      if (disposed) return;
      disposed = true;
      motionQuery.removeEventListener("change", applyReducedMotion);
    }

    motionQuery.addEventListener("change", applyReducedMotion);
    applyReducedMotion();
    return Object.freeze({ destroy, set });
  }

  g.O_PET_PREFERENCES = Object.freeze({ create });
})(globalThis[Symbol.for("o-pet.renderer")]);
