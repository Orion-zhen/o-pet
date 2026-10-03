// @ts-check
/* 只提交变化的 SVG 属性和内联样式. 渲染器通过此模块管理这些写入. */

/** @typedef {"display" | "opacity" | "fill" | "stroke" | "transform" | "transformOrigin"} StyleProperty */
/** @type {WeakMap<SVGElement, Map<StyleProperty, string>>} */
const styles = new WeakMap();

/** @param {SVGElement} element @param {string} name @param {string} value */
function setAttribute(element, name, value) {
  if (element.getAttribute(name) === value) return;
  element.setAttribute(name, value);
  if (name === "style") styles.delete(element);
}

/** @param {SVGElement} element @param {StyleProperty} name @param {string} value */
function setStyle(element, name, value) {
  let previous = styles.get(element);
  if (previous?.get(name) === value) return;
  // 浏览器会规范化 opacity 等值, 例如将 "1.000" 读回为 "1".
  // 比较最后提交值, 不依赖浏览器的序列化格式.
  element.style[name] = value;
  if (!previous) {
    previous = new Map();
    styles.set(element, previous);
  }
  previous.set(name, value);
}

export { setAttribute, setStyle };
