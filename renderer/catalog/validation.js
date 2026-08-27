// @ts-check
/* 动画目录契约检查。验证每个场景引用的控制器、视觉资源和眼睛数据。 */

/**
 * @param {import("../types.js").PresetCatalog} presets
 * @param {import("../types.js").AnimationTables} tables
 * @param {import("../types.js").AnimationRegistries} registries
 */
function validate(presets, tables, registries) {
  /** @param {string} name @param {string | null} value @param {import("../types.js").IdRegistry} registry @param {string} channel */
  const validateId = (name, value, registry, channel) => {
    if (value !== null && !registry.has(value))
      throw new Error(`动画 ${name} 引用了未知 ${channel}: ${value}`);
  };

  /**
   * @param {string} name
   * @param {import("../types.js").Scene} scene
   */
  function validateScene(name, scene) {
    const resolved = presets.resolve(scene);
    validateId(name, resolved.motion, registries.motion, "motion");
    validateId(name, resolved.face, registries.face, "face");
    validateId(name, resolved.gaze, registries.gaze, "gaze");
    validateId(
      name,
      resolved.choreography,
      registries.choreography,
      "choreography",
    );
    validateId(name, resolved.shape, registries.shape, "shape");
    validateId(name, resolved.form, registries.form, "form");
    validateId(
      name,
      resolved.decoration,
      registries.decoration,
      "decoration",
    );
    validateId(name, resolved.particles, registries.particles, "particles");
    validateId(name, resolved.camera, registries.camera, "camera");
    validateId(name, resolved.badge, registries.badge, "badge");
    if (!(resolved.expression in tables.EYE_PLAYLIST))
      throw new Error(`动画 ${name} 缺少眼形播放列表: ${resolved.expression}`);
    if (!(resolved.expression in tables.EYE_HOLD_MS))
      throw new Error(`动画 ${name} 缺少眼形保持时间: ${resolved.expression}`);
    if (!(resolved.expression in tables.BLINK_MS))
      throw new Error(`动画 ${name} 缺少眨眼配置: ${resolved.expression}`);
  }

  for (const [name, scene] of Object.entries(presets.scenes))
    validateScene(`scene:${name}`, scene);
  for (const [name, action] of Object.entries(presets.actions))
    validateScene(`action:${name}`, action);
}

export { validate };
