import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const rendererRoot = new URL("../../renderer/", import.meta.url);

function javascriptFiles(directory: URL): URL[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
		if (entry.isDirectory()) return javascriptFiles(path);
		return entry.name.endsWith(".js") ? [path] : [];
	});
}

describe("渲染器模块边界", () => {
	it("使用标准 ESM 且不再依赖全局模块注册表", () => {
		for (const path of javascriptFiles(rendererRoot)) {
			const source = readFileSync(path, "utf8");
			expect(source).not.toContain("Symbol.for(\"o-pet.renderer\")");
			expect(source).not.toMatch(/\b(?:g|global|window)\.OPET_/);
		}
	});

	it("组合、行为、目录、适配、时间线、帧引擎和 SVG 入口都启用严格 JavaScript 检查", () => {
		const checked = [
			new URL("host.js", rendererRoot),
			new URL("start.js", rendererRoot),
			new URL("bootstrap.js", rendererRoot),
			new URL("types.js", rendererRoot),
			...javascriptFiles(new URL("adapters/", rendererRoot)),
			...javascriptFiles(new URL("behaviors/", rendererRoot)),
			...javascriptFiles(new URL("catalog/", rendererRoot)),
			...javascriptFiles(new URL("engine/", rendererRoot)),
			...javascriptFiles(new URL("runtime/", rendererRoot)),
			...javascriptFiles(new URL("view/effects/", rendererRoot)),
			new URL("view/svg.js", rendererRoot),
		];
		for (const path of checked)
			expect(readFileSync(path, "utf8")).toMatch(/^\/\/ @ts-check\n/);
	});
});
