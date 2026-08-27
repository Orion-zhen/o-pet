// @ts-check
/* 动画目录契约检查。只验证动作名称与控制通道数据是否完整。 */

/**
 * @param {readonly string[]} actionNames
 * @param {import("../types.js").PresetCatalog} presets
 * @param {import("../types.js").AnimationTables} tables
 */
function validate(actionNames, presets, tables) {
  /**
   * @param {string} name
   * @param {import("../types.js").Scene} scene
   */
  const validateScene = (name, scene) => {
    const resolved = presets.resolve(scene);
    if (!(resolved.expression in tables.EYE_PLAYLIST))
      throw new Error(`动画 ${name} 缺少眼形播放列表: ${resolved.expression}`);
    if (!(resolved.expression in tables.EYE_HOLD_MS))
      throw new Error(`动画 ${name} 缺少眼形保持时间: ${resolved.expression}`);
    if (!(resolved.expression in tables.BLINK_MS))
      throw new Error(`动画 ${name} 缺少眨眼配置: ${resolved.expression}`);
  };
  for (const [name, scene] of Object.entries(presets.scenes))
    validateScene(name, scene);
  for (const name of actionNames) validateScene(name, presets.fromState(name));
}

export { validate };
