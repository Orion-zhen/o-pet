import { describe, expect, it } from "vitest";

import { create } from "../../renderer/runtime/scheduler.js";
import { ClockStub } from "./browser-stubs.js";

describe("渲染器统一时钟", () => {
	it("统一时钟在所有暂停原因释放后继续定时器和动画帧", () => {
		const clock = new ClockStub();
		const scheduler = create({
			frameClock: clock,
			now: () => clock.now,
			timerClock: clock,
		});
		const events: string[] = [];
		scheduler.pause("hidden");
		scheduler.pause("modal");
		scheduler.setTimeout(() => events.push(`timer:${scheduler.now()}`), 100);
		scheduler.requestAnimationFrame((time: number) => events.push(`frame:${time}`));
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
