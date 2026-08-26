import vm from "node:vm";
import { describe, expect, it } from "vitest";

import { pageEndSource, pageStartSource } from "./sources.js";

describe("渲染页面组合根", () => {
	it("页面组合根为渲染器注入浏览器随机源", () => {
		let receivedRandom: unknown;
		const random = (): number => 0.25;
		const document = {
			addEventListener(): void {},
			getElementById(): object {
				return {};
			},
		};
		const renderer = {
			destroy(): void {},
			setPreferences(): void {},
			showAction(): void {},
			update(): void {},
		};
		const browserStub: Record<string, unknown> = {
			addEventListener(): void {},
			document,
			innerWidth: 240,
			matchMedia: (): object => ({}),
			Math: { random },
			oPetNative: { postDrag(): void {}, ready(): void {} },
			performance: { now: (): number => 0 },
			receiveRandom(value: unknown): void {
				receivedRandom = value;
			},
			renderer,
		};
		const rendererFactoryStub = `
			window.OPetRenderer = Object.freeze({
				create(options) {
					browser.receiveRandom(options.random);
					return browser.renderer;
				},
			});
		`;
		const html = pageStartSource + rendererFactoryStub + pageEndSource;
		const scriptStart = html.indexOf("<script>");
		const scriptEnd = html.lastIndexOf("</script>");
		expect(scriptStart).toBeGreaterThanOrEqual(0);
		expect(scriptEnd).toBeGreaterThan(scriptStart);
		const script = html.slice(scriptStart + "<script>".length, scriptEnd);
		vm.runInNewContext(script, browserStub);

		expect(receivedRandom).toBe(random);
	});

});
