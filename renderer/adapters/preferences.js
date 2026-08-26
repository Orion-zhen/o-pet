/* 渲染偏好适配器。校验外部配置并统一管理系统动态偏好监听。 */
(function (g) {
  const hasOwn = (value, key) =>
    Object.prototype.hasOwnProperty.call(value, key);

  function create(options) {
    const { character, geometry, motionQuery } = options;
    let reduceMotionPreference = false;
    let disposed = false;

    function applyReducedMotion() {
      character.setReduceMotion(motionQuery.matches || reduceMotionPreference);
    }

    function set(preferences) {
      if (disposed || preferences === null || typeof preferences !== "object")
        return false;
      if (
        typeof preferences.shape === "string" &&
        hasOwn(geometry.shapes, preferences.shape)
      ) {
        character.setShape(preferences.shape);
      }
      if (
        typeof preferences.color === "string" &&
        hasOwn(geometry.palette, preferences.color)
      ) {
        character.setColor(preferences.color);
      }
      if (typeof preferences.body_color === "string")
        character.setInk(preferences.body_color);
      if (typeof preferences.eye_color === "string")
        character.setEyeColor(preferences.eye_color);
      if (preferences.scheme === "light" || preferences.scheme === "dark") {
        character.setColor(character.colorId, preferences.scheme);
      }
      if (typeof preferences.followPointer === "boolean")
        character.setFollowPointer(preferences.followPointer);
      if (typeof preferences.reduceMotion === "boolean") {
        reduceMotionPreference = preferences.reduceMotion;
        applyReducedMotion();
      }
      return true;
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
