/* 渲染偏好适配器。校验外部配置并统一管理系统动态偏好监听。 */
(function (g) {
  const hasOwn = (value, key) =>
    Object.prototype.hasOwnProperty.call(value, key);
  const isFiniteNumber = (value) =>
    typeof value === "number" && Number.isFinite(value);
  const isUnit = (value) =>
    isFiniteNumber(value) && value >= 0 && value <= 1;
  const isStop = (value) =>
    value !== null &&
    typeof value === "object" &&
    isUnit(value.offset) &&
    typeof value.color === "string" &&
    isUnit(value.opacity);
  const isBodyPaint = (value) => {
    if (value === null || typeof value !== "object") return false;
    if (value.kind === "solid") return typeof value.color === "string";
    if (
      !Array.isArray(value.stops) ||
      value.stops.length < 2 ||
      !value.stops.every(isStop) ||
      typeof value.accent !== "string"
    ) return false;
    if (value.kind === "linear") return isFiniteNumber(value.angle);
    return value.kind === "radial" &&
      Array.isArray(value.center) &&
      value.center.length === 2 &&
      value.center.every(isUnit) &&
      isFiniteNumber(value.blur) &&
      value.blur >= 0 &&
      value.blur <= 32;
  };

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
      if (isBodyPaint(preferences.body_color))
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
