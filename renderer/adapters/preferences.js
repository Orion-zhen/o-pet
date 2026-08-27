// @ts-check
/* 渲染偏好适配器。应用原生配置并管理系统动态偏好监听。 */
/**
 * @param {{ character: import("../types.js").CharacterPort, motionQuery: MediaQueryList }} options
 */
function create(options) {
  const { character, motionQuery } = options;
  let disposed = false;

  function applyReducedMotion() {
    character.setReduceMotion(motionQuery.matches);
  }

  /** @param {import("../types.js").RendererPreferences} preferences */
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

export { create };
