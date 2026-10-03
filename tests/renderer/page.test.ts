import { describe, expect, it } from "vitest";

import { start } from "../../renderer/start.js";

describe("渲染页面组合根", () => {
	it("页面组合根注入浏览器随机源并暴露原生拖动完成入口", () => {
		let receivedRandom: unknown;
		let nativeDragFinished = false;
		const visibility: boolean[] = [];
		const random = (): number => 0.25;
		const document = {
			addEventListener(): void {},
			querySelector(): object {
				return {};
			},
		};
		const renderer = {
			destroy(): void {},
			finishNativeDrag(): void {
				nativeDragFinished = true;
			},
			setPreferences(): void {},
			setVisible(visible: boolean): void {
				visibility.push(visible);
			},
			showAction(): void {},
			update(): boolean {
				return true;
			},
		};
		const browserStub = {
			addEventListener(): void {},
			document,
			innerWidth: 240,
			matchMedia: (): object => ({}),
			Math: { random },
			oPetNative: { postDrag(): void {}, ready(): void {} },
			performance: { now: (): number => 0 },
		};

		// @ts-expect-error 页面替身只实现启动函数实际使用的浏览器接口。
		start(browserStub, (options: { random: unknown }) => {
			receivedRandom = options.random;
			return renderer;
		});

		expect(receivedRandom).toBe(random);
		(
			browserStub as typeof browserStub & {
				oPet: { finishNativeDrag(): void };
			}
		).oPet.finishNativeDrag();
		expect(nativeDragFinished).toBe(true);
		const client = (browserStub as typeof browserStub & {
			oPet: { setVisible(visible: boolean): void };
		}).oPet;
		client.setVisible(false);
		client.setVisible(true);
		expect(visibility).toEqual([false, true]);
	});
});
