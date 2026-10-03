import { describe, expect, it, vi } from "vitest";

import { setAttribute, setStyle } from "../../renderer/view/dom.js";
import { SvgElementStub } from "./browser-stubs.js";

function element(): { node: SVGElement; stub: SvgElementStub } {
	const stub = new SvgElementStub("path");
	return { node: stub as unknown as SVGElement, stub };
}

describe("SVG 差量提交", () => {
	it("相同属性只写一次，变化后立即提交", () => {
		const { node, stub } = element();
		const writes = vi.spyOn(stub, "setAttribute");
		setAttribute(node, "d", "M0 0L1 1");
		setAttribute(node, "d", "M0 0L1 1");
		expect(writes).toHaveBeenCalledTimes(1);
		setAttribute(node, "d", "M0 0L2 2");
		expect(writes).toHaveBeenCalledTimes(2);
		expect(stub.getAttribute("d")).toBe("M0 0L2 2");
	});

	it("样式值经浏览器规范化后也不会重复写入", () => {
		const { node, stub } = element();
		let opacity = "";
		let writes = 0;
		Object.defineProperty(stub.style, "opacity", {
			get: () => opacity,
			set(value: string) {
				opacity = String(Number(value));
				writes += 1;
			},
		});
		setStyle(node, "opacity", "1.000");
		setStyle(node, "opacity", "1.000");
		expect(opacity).toBe("1");
		expect(writes).toBe(1);
		setStyle(node, "opacity", "0.500");
		expect(opacity).toBe("0.5");
		expect(writes).toBe(2);
	});

	it("不同节点独立提交样式，替换整个 style 后清除旧记录", () => {
		const first = element();
		const second = element();
		setStyle(first.node, "display", "none");
		setStyle(second.node, "display", "none");
		expect(first.stub.style.display).toBe("none");
		expect(second.stub.style.display).toBe("none");

		let writes = 0;
		Object.defineProperty(first.stub.style, "display", {
			set() { writes += 1; },
		});
		setStyle(first.node, "display", "none");
		expect(writes).toBe(0);
		setAttribute(first.node, "style", "display:block");
		setStyle(first.node, "display", "none");
		expect(writes).toBe(1);
	});
});
