// @ts-check
/* 动画标识符注册表。目录校验和运行时共同使用同一组受支持名称。 */

/**
 * @param {string} kind
 * @param {readonly string[]} values
 * @returns {import("../types.js").IdRegistry}
 */
function create(kind, values) {
  const unique = new Set(values);
  if (unique.size !== values.length)
    throw new Error(`${kind} 注册表包含重复名称`);
  const frozenValues = Object.freeze([...values]);
  return Object.freeze({
    /** @param {string} value */
    has: (value) => unique.has(value),
    values: frozenValues,
  });
}

/**
 * @param {string} kind
 * @param {Readonly<Record<string, string>>} mappings
 * @param {Readonly<Record<string, unknown>>} definitions
 */
function validateMappings(kind, mappings, definitions) {
  for (const [name, target] of Object.entries(mappings)) {
    if (!(target in definitions))
      throw new Error(`${kind} ${name} 缺少控制器定义: ${target}`);
  }
}

export { create, validateMappings };
