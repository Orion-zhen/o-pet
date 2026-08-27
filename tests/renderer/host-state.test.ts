import { describe, expect, it } from "vitest";

import { create as createHostState } from "../../renderer/runtime/host-state.js";
import { create as createScheduler } from "../../renderer/runtime/scheduler.js";
import type { Timeline } from "../../renderer/types.js";
import { ClockStub } from "./browser-stubs.js";

describe("Host 状态生命周期", () => {
	it("按旧状态停止导演并集中管理切换计时器", () => {
		const clock = new ClockStub();
		const scheduler = createScheduler({
			frameClock: clock,
			now: () => clock.now,
			timerClock: clock,
		});
		const stopped: string[] = [];
		const timeline: Timeline = {
			cancel: (owner?: string) => void stopped.push(`timeline:${owner ?? "all"}`),
			destroy(): void {},
			play(): void {},
		};
		const state = createHostState({
			activities: { stop: () => void stopped.push("activity") },
			cues: { cancel: () => void stopped.push("cue") },
			idle: { stop: () => void stopped.push("idle") },
			scheduler,
			timeline,
		});

		state.transition("idle");
		state.transition("activity");
		state.transition("cue");
		state.transition("interaction");
		state.transition("preview");
		expect(stopped).toEqual([
			"timeline:protected",
			"idle",
			"activity",
			"cue",
			"timeline:interaction",
		]);

		let ready = 0;
		state.scheduleSwitch(350, () => {
			ready += 1;
		});
		expect(stopped.at(-1)).toBe("timeline:preview");
		clock.advance(349);
		expect(ready).toBe(0);
		clock.advance(1);
		expect(ready).toBe(1);

		state.scheduleSwitch(350, () => {
			ready += 1;
		});
		state.transition("idle");
		clock.advance(350);
		expect(ready).toBe(1);
		state.destroy();
		scheduler.destroy();
	});
});
