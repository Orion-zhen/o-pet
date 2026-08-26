import vm from "node:vm";
import { describe, expect, it } from "vitest";

import { ClockStub } from "./browser-stubs.js";
import { schedulerSource } from "./sources.js";

describe("渲染器统一时钟", () => {
	it("统一时钟在所有暂停原因释放后继续定时器和动画帧", () => {
		const clock = new ClockStub();
		const windowStub: Record<string, unknown> = {};
		windowStub.window = windowStub;
		vm.runInNewContext(schedulerSource, windowStub);
		const schedulerModule = windowStub.O_PET_SCHEDULER as {
			create(options: {
				frameClock: ClockStub;
				now: () => number;
				timerClock: ClockStub;
			}): {
				destroy(): void;
				now(): number;
				pause(reason: string): void;
				requestAnimationFrame(callback: (time: number) => void): number | null;
				resume(reason: string): void;
				setTimeout(callback: () => void, delay: number): number | null;
			};
		};
		const scheduler = schedulerModule.create({ frameClock: clock, now: () => clock.now, timerClock: clock });
		const events: string[] = [];
		scheduler.pause("hidden");
		scheduler.pause("modal");
		scheduler.setTimeout(() => events.push(`timer:${scheduler.now()}`), 100);
		scheduler.requestAnimationFrame((time) => events.push(`frame:${time}`));
		clock.advance(1000);
		expect(events).toEqual([]);
		expect(scheduler.now()).toBe(0);

		scheduler.resume("hidden");
		clock.advance(1000);
		expect(events).toEqual([]);
		scheduler.resume("modal");
		clock.advance(16);
		expect(events).toEqual(["frame:16"]);
		clock.advance(84);
		expect(events).toEqual(["frame:16", "timer:100"]);
		scheduler.destroy();
	});

});
