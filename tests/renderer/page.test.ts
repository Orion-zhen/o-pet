import vm from "node:vm";
import { describe, expect, it } from "vitest";

import { startSource } from "./sources.js";

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
		const modules = {
			OPetRenderer: Object.freeze({
				create(options: { random: unknown }): typeof renderer {
					receivedRandom = options.random;
					return renderer;
				},
			}),
		};
		const browserStub: Record<string, unknown> = {
			addEventListener(): void {},
			document,
			innerWidth: 240,
			matchMedia: (): object => ({}),
			Math: { random },
			oPetNative: { postDrag(): void {}, ready(): void {} },
			performance: { now: (): number => 0 },
			window: modules,
		};
		vm.runInNewContext(startSource, browserStub);

		expect(receivedRandom).toBe(random);
	});
});
