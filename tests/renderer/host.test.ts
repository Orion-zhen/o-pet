import { describe, expect, it } from "vitest";

import { createHarness, latest } from "./host-fixture.js";

describe("渲染器组合根行为", () => {
	it("按名称循环预览动画预设并在轮次间暂停一秒", () => {
		const { api, character, clock } = createHarness();
		expect(api.showAction("happy")).toBe(true);
		expect(latest(character).pose).toBe("happy");

		clock.advance(2999);
		expect(character.paused).not.toContain(true);
		clock.advance(1);
		expect(character.paused.at(-1)).toBe(true);
		clock.advance(999);
		expect(character.paused.at(-1)).toBe(true);
		clock.advance(1);
		expect(character.paused.at(-1)).toBe(false);
		expect(character.scenes.filter((scene) => scene.pose === "happy")).toHaveLength(2);
		expect(character.playedStates).toEqual(["happy", "happy"]);
		expect(api.update({ activity: "thinking" })).toBe(false);
	});

	it("front 预览组合正面注意姿态和锁定视线", () => {
		const { api, character } = createHarness();
		expect(api.showAction("front")).toBe(true);
		expect(latest(character)).toMatchObject({
			pose: "listening",
			expression: "front",
			gaze: "front",
		});
	});

	it("页面隐藏期间暂停预览循环的计时", () => {
		const { api, character, clock, document } = createHarness();
		api.showAction("sleeping");
		clock.advance(1000);
		document.hidden = true;
		document.dispatch("visibilitychange");
		clock.advance(5000);
		expect(character.playedStates).toEqual(["sleeping"]);

		document.hidden = false;
		document.dispatch("visibilitychange");
		clock.advance(2999);
		expect(character.playedStates).toEqual(["sleeping"]);
		clock.advance(1);
		expect(character.playedStates).toEqual(["sleeping", "sleeping"]);
	});

	it("拒绝未知的动画预设", () => {
		const { api, character } = createHarness();
		const count = character.scenes.length;
		expect(api.showAction("missing")).toBe(false);
		expect(character.scenes).toHaveLength(count);
	});

	it.each([
		["thinking", "thinking", null],
		["searching", "searching", null],
		["coding", "working", "writing"],
		["receiving", "working", "receiving"],
		["consulting", "thinking", "orbit"],
		["tooling", "working", "orbit"],
		["replying", "listening", "dictating"],
	] as const)("将 %s 活动组合为姿态和特效通道", (activity, pose, effect) => {
		const { api, character, clock } = createHarness();
		expect(api.update({ activity })).toBe(true);
		clock.advance(2000);
		expect(latest(character)).toMatchObject({ pose, effect });
	});

	it("空闲片段先转移视线，再让身体跟随", () => {
		const { character, clock } = createHarness();
		clock.advance(7000);
		expect(latest(character)).toMatchObject({
			pose: "idle",
			expression: "listening",
			gaze: "listening",
		});
		clock.advance(250);
		expect(latest(character).pose).toBe("listening");
	});

	it("空闲片段为旋转和弹跳保留完整时间窗口", () => {
		const { character, clock } = createHarness();
		clock.advance(8600);
		expect(latest(character).pose).toBe("playful");
		clock.advance(2999);
		expect(latest(character).pose).toBe("playful");
		clock.advance(1);
		expect(latest(character).pose).toBe("happy");
		clock.advance(1399);
		expect(latest(character).pose).toBe("happy");
		clock.advance(1);
		expect(latest(character).pose).toBe("idle");
	});

	it("最近空闲片段不会短时间重复", () => {
		const { character, clock } = createHarness();
		clock.advance(60_000);
		const storyStarts = character.scenes
			.filter((value) => value.pose === "idle" && ["listening", "searching", "curious"].includes(value.gaze))
			.map((value) => value.gaze);
		expect(storyStarts.slice(0, 3)).toEqual(["listening", "searching", "curious"]);
	});

	it("空闲阶段边界由每次会话的随机序列决定", () => {
		const early = createHarness(false, () => 0);
		const late = createHarness(false, () => 0.999);
		early.clock.advance(4 * 60_000 + 10_000);
		late.clock.advance(4 * 60_000 + 10_000);
		expect(early.character.scenes.some((value) => value.pose === "drowsy")).toBe(true);
		expect(late.character.scenes.some((value) => value.pose === "drowsy")).toBe(false);
	});

	it("高能量片段在清醒阶段保持低频", () => {
		const { clock, highEnergyAt } = createHarness(false, () => 0.999);
		clock.advance(150_000);
		expect(highEnergyAt).toHaveLength(2);
		const [first, second] = highEnergyAt;
		if (first === undefined || second === undefined) throw new Error("缺少高能量片段时间");
		expect(second - first).toBeGreaterThanOrEqual(20_000);
	});

	it("思考几秒后优先进入 humming，随后回到思考", () => {
		const { api, character, clock } = createHarness();
		api.update({ activity: "thinking" });
		clock.advance(2000);
		expect(latest(character).pose).toBe("thinking");
		clock.advance(3000);
		expect(latest(character)).toMatchObject({ pose: "humming", effect: "humming" });
		clock.advance(6000);
		expect(latest(character).pose).toBe("thinking");
	});

	it("长时间书写后同步收起铅笔、抬头和条带旋转", () => {
		const { api, character, clock } = createHarness();
		api.update({ activity: "coding" });
		clock.advance(2000);
		expect(latest(character).effect).toBe("writing");
		clock.advance(9999);
		expect(latest(character).effect).toBe("writing");
		expect(character.spinCount).toBe(0);
		clock.advance(1);
		expect(latest(character)).toMatchObject({ pose: "thinking", effect: null });
		expect(character.spinCount).toBe(1);
		clock.advance(2200);
		expect(latest(character).effect).toBe("writing");
	});

	it("终端先敲命令，随后持续显示等待动画", () => {
		const { api, character, clock } = createHarness();
		api.update({ activity: "terminal" });
		clock.advance(2000);
		expect(latest(character)).toMatchObject({ pose: "working", effect: null });
		clock.advance(650);
		expect(latest(character).effect).toBe("loading");
		api.update({ activity: "terminal", cue: "progress" });
		expect(latest(character).effect).toBe("loading");
		clock.advance(2200);
		expect(latest(character).effect).toBe("loading");
	});


	it("审批只短暂警示，随后等待并显示五秒提醒角标", () => {
		const { api, character, clock } = createHarness();
		api.update({ activity: "awaiting_approval" });
		expect(latest(character).pose).toBe("alerting");
		clock.advance(1600);
		expect(latest(character).pose).toBe("listening");
		clock.advance(15_000);
		expect(latest(character).pose).toBe("notifying");
		clock.advance(4999);
		expect(latest(character).pose).toBe("notifying");
		clock.advance(1);
		expect(latest(character).pose).toBe("listening");
	});

	it("错误反应保留正在使用的工具特效", () => {
		const { api, character, clock } = createHarness();
		api.update({ activity: "coding" });
		clock.advance(2000);
		api.update({ activity: "coding", cue: "error_repeated" });
		expect(latest(character)).toMatchObject({ pose: "confused", effect: "writing" });
		clock.advance(1200);
		expect(latest(character)).toMatchObject({ pose: "working", effect: "writing" });
	});

	it("简单任务完成时使用竖线眼并单眨一只眼", () => {
		const { api, character, clock } = createHarness();
		api.update({ activity: "idle", cue: "completed_quick" });
		clock.advance(2000);
		expect(latest(character)).toMatchObject({ pose: "happy", expression: "winking" });
		expect(character.winkCount).toBe(1);
		clock.advance(900);
		expect(latest(character).pose).toBe("notifying");
	});

	it("审批通过仍使用普通 happy 眼神", () => {
		const { api, character, clock } = createHarness();
		api.update({ activity: "thinking", cue: "approval_granted" });
		clock.advance(2000);
		expect(latest(character)).toMatchObject({ pose: "happy", expression: "happy" });
		expect(character.winkCount).toBe(0);
	});

	it("困难完成只播放 celebrate 和 notifying", () => {
		const { api, character, clock } = createHarness();
		api.update({ activity: "idle", cue: "completed_hard" });
		clock.advance(2000);
		expect(latest(character).pose).toBe("celebrate");
		clock.advance(2500);
		expect(latest(character).pose).toBe("notifying");
		clock.advance(4999);
		expect(latest(character).pose).toBe("notifying");
		clock.advance(1);
		expect(latest(character).pose).toBe("idle");
		expect(character.scenes.map((value) => value.pose)).not.toContain("laughing");
	});

	it("先完成回复发送动作，再播放完成反馈", () => {
		const { api, character, clock } = createHarness();
		api.update({ activity: "replying" });
		clock.advance(2000);
		api.update({ activity: "replying", cue: "reply_sent" });
		api.update({ activity: "idle", cue: "completed_normal" });
		clock.advance(849);
		expect(latest(character).effect).toBe("sending");
		clock.advance(1);
		expect(latest(character).pose).toBe("proud");
	});

	it("快速工具切换只进入消抖后的最新活动", () => {
		const { api, character, clock } = createHarness();
		clock.advance(2000);
		api.update({ activity: "searching" });
		clock.advance(100);
		api.update({ activity: "coding" });
		clock.advance(349);
		expect(latest(character).pose).toBe("idle");
		clock.advance(1);
		expect(latest(character).effect).toBe("writing");
		expect(character.scenes.map((value) => value.pose)).not.toContain("searching");
	});

	it("隐藏页面时暂停场景计时，恢复后继续", () => {
		const { api, character, clock, document } = createHarness();
		api.update({ activity: "idle", cue: "completed_hard" });
		clock.advance(2000);
		document.hidden = true;
		document.dispatch("visibilitychange");
		clock.advance(10_000);
		expect(latest(character).pose).toBe("celebrate");
		document.hidden = false;
		document.dispatch("visibilitychange");
		clock.advance(2500);
		expect(latest(character).pose).toBe("notifying");
		expect(character.paused).toEqual([]);
	});

	it("隐藏期间不推进空闲阶段", () => {
		const { character, clock, document } = createHarness();
		clock.advance(2000);
		document.hidden = true;
		document.dispatch("visibilitychange");
		clock.advance(4 * 60_000);
		document.hidden = false;
		document.dispatch("visibilitychange");
		expect(latest(character).pose).toBe("idle");
		clock.advance(4 * 60_000 - 2000 + 10_000);
		expect(latest(character).pose).toBe("drowsy");
	});

	it("隐藏期间收到的新活动从页面恢复时开始计时", () => {
		const { api, character, clock, document } = createHarness();
		clock.advance(2000);
		document.hidden = true;
		document.dispatch("visibilitychange");
		clock.advance(10 * 60_000);
		api.update({ activity: "thinking" });
		clock.advance(5 * 60_000);
		document.hidden = false;
		document.dispatch("visibilitychange");
		clock.advance(350);
		expect(latest(character).pose).toBe("thinking");
		expect(character.scenes.map((value) => value.pose)).not.toContain("waking");
	});

	it("应用受支持的身形、配色和动态偏好", () => {
		const { api, character, motion } = createHarness();
		expect(api.setPreferences({
			body_color: "#123456",
			color: "blue",
			eye_color: "#abcdef",
			followPointer: false,
			reduceMotion: true,
			scheme: "dark",
			shape: "cloud",
		})).toBe(true);
		expect(character.shapes).toEqual(["cloud"]);
		expect(character.colors).toEqual([["blue", undefined], ["blue", "dark"]]);
		expect(character.bodyColors).toEqual(["#123456"]);
		expect(character.eyeColors).toEqual(["#abcdef"]);
		expect(character.followingPointer).toEqual([false]);
		expect(character.reducedMotion.at(-1)).toBe(true);

		api.setPreferences({ reduceMotion: false });
		motion.matches = true;
		motion.dispatch("change");
		expect(character.reducedMotion.at(-1)).toBe(true);
	});

	it("拖动时临时播放 dragging，并按动画帧合并移动", () => {
		const { clock, character, document, drags } = createHarness();
		document.body.dispatch("pointerdown", { button: 0, pointerId: 4, clientX: 20, clientY: 30 });
		expect(latest(character).pose).toBe("dragging");
		document.body.dispatch("pointermove", { buttons: 1, pointerId: 4, clientX: 21, clientY: 29 });
		document.body.dispatch("pointermove", { buttons: 1, pointerId: 4, clientX: 27, clientY: 25 });
		expect(drags).toEqual([{ phase: "start" }]);

		clock.advance(16);
		document.body.dispatch("pointermove", { buttons: 1, pointerId: 4, clientX: 34, clientY: 20 });
		document.body.dispatch("pointerup", { pointerId: 4 });
		expect(latest(character).pose).toBe("spawning");
		expect(drags).toEqual([
			{ phase: "start" },
			{ phase: "move", dx: 7, dy: -5 },
			{ phase: "move", dx: 7, dy: -5 },
			{ phase: "end" },
		]);
		expect(document.body.capturedPointers).toEqual([4]);
		expect(document.body.classes.has("dragging")).toBe(false);
	});

	it("鼠标进入后先追踪鼠标，再回正看向用户", () => {
		const { character, clock, document } = createHarness();
		clock.advance(2000);
		document.body.dispatch("pointerenter");
		expect(latest(character)).toMatchObject({ pose: "curious", gaze: "curious" });
		clock.advance(500);
		expect(latest(character)).toMatchObject({ pose: "listening", gaze: "front" });
	});

	it("困倦阶段仍会播放片段并回到 drowsy", () => {
		const { character, clock } = createHarness();
		clock.advance(4 * 60_000 + 500);
		expect(latest(character).pose).toBe("drowsy");
		const sceneCount = character.scenes.length;
		clock.advance(30_000);
		expect(character.scenes.length).toBeGreaterThan(sceneCount);
		expect(latest(character).pose).toBe("drowsy");
	});

	it("睡眠阶段轮换梦境变体并在片段之间回到 sleeping", () => {
		const { character, clock } = createHarness();
		clock.advance(10 * 60_000 + 18_000);
		const first = latest(character).variant;
		expect(first).toBe("float");
		clock.advance(6000);
		expect(latest(character).pose).toBe("sleeping");
		clock.advance(18_000);
		const second = latest(character).variant;
		expect(second).toBe("curl");
		expect(second).not.toBe(first);
		clock.advance(6000 + 18_000);
		expect(latest(character).variant).toBe("twitch");
	});

	it("睡眠阶段进入梦境，Agent 活动按保存的睡眠深度先唤醒", () => {
		const { api, character, clock } = createHarness();
		clock.advance(10 * 60_000 + 18_000);
		expect(latest(character)).toMatchObject({
			pose: "dreaming",
			expression: "sleeping",
			gaze: "sleeping",
		});
		expect(["float", "curl", "twitch"]).toContain(latest(character).variant);

		api.update({ activity: "thinking" });
		clock.advance(350);
		expect(latest(character).pose).toBe("waking");
		clock.advance(1800);
		expect(latest(character).pose).toBe("thinking");
	});

	it("困倦片段被 Agent 打断时不依赖当前画面判断唤醒", () => {
		const { api, character, clock } = createHarness();
		clock.advance(4 * 60_000 + 13_000);
		expect(latest(character).pose).toBe("surprised");
		api.update({ activity: "thinking" });
		clock.advance(350);
		expect(latest(character).pose).toBe("waking");
	});

	it("困倦拖动结束后面向用户询问，再回到 drowsy", () => {
		const { character, clock, document } = createHarness();
		clock.advance(4 * 60_000);
		document.body.dispatch("pointerdown", { button: 0, pointerId: 7, clientX: 20, clientY: 30 });
		expect(latest(character).pose).toBe("dragging");
		document.body.dispatch("pointerup", { pointerId: 7 });
		expect(latest(character)).toMatchObject({
			pose: "quizzical",
			expression: "quizzical",
			gaze: "front",
		});
		expect(latest(character).pose).not.toBe("confused");
		clock.advance(2200);
		expect(latest(character).pose).toBe("drowsy");
	});

	it("quizzical 连续选择相反方向且始终使用 front 视线", () => {
		const { character, clock, document } = createHarness();
		clock.advance(2000);
		const directions: Array<number | undefined> = [];
		for (const pointerId of [20, 21]) {
			document.body.dispatch("pointerdown", { button: 0, pointerId, clientX: 20, clientY: 30 });
			document.body.dispatch("pointerup", { pointerId });
			directions.push(latest(character).direction);
			expect(latest(character).gaze).toBe("front");
			clock.advance(2200);
		}
		const [first, second] = directions;
		if (first === undefined || second === undefined) throw new Error("缺少询问方向");
		expect(first).toBe(-second);
	});

	it("睡眠时立即开始原生拖动，并在惊醒后显示 dragging", () => {
		const { character, clock, document, drags } = createHarness();
		clock.advance(10 * 60_000);
		document.body.dispatch("pointerdown", { button: 0, pointerId: 8, clientX: 20, clientY: 30 });
		expect(drags).toEqual([{ phase: "start" }]);
		expect(latest(character).pose).toBe("startled");
		clock.advance(650);
		expect(latest(character).pose).toBe("dragging");
		document.body.dispatch("pointerup", { pointerId: 8 });
		expect(latest(character)).toMatchObject({ pose: "quizzical", gaze: "front" });
	});

	it("单次睡眠打断暂时回到 drowsy，随后快速入睡", () => {
		const { character, clock, document } = createHarness();
		clock.advance(10 * 60_000);
		document.body.dispatch("pointerdown", { button: 0, pointerId: 22, clientX: 20, clientY: 30 });
		document.body.dispatch("pointerup", { pointerId: 22 });
		clock.advance(650 + 2200);
		expect(latest(character).pose).toBe("drowsy");
		clock.advance(19_999);
		expect(latest(character).pose).toBe("drowsy");
		clock.advance(1);
		expect(latest(character).pose).toBe("sleeping");
	});

	it("页面隐藏和减少动态模式不改变惊醒交互顺序", () => {
		const { api, character, clock, document } = createHarness();
		api.setPreferences({ reduceMotion: true });
		clock.advance(10 * 60_000);
		document.body.dispatch("pointerdown", { button: 0, pointerId: 23, clientX: 20, clientY: 30 });
		clock.advance(100);
		document.hidden = true;
		document.dispatch("visibilitychange");
		clock.advance(10_000);
		expect(latest(character).pose).toBe("startled");
		document.hidden = false;
		document.dispatch("visibilitychange");
		clock.advance(550);
		expect(latest(character).pose).toBe("dragging");
	});

	it("睡眠时快速松开会跳过 dragging", () => {
		const { character, clock, document } = createHarness();
		clock.advance(10 * 60_000);
		document.body.dispatch("pointerdown", { button: 0, pointerId: 9, clientX: 20, clientY: 30 });
		document.body.dispatch("pointerup", { pointerId: 9 });
		clock.advance(649);
		expect(latest(character).pose).toBe("startled");
		clock.advance(1);
		expect(latest(character).pose).toBe("quizzical");
		expect(character.scenes.slice(-2).map((scene) => scene.pose)).toEqual(["startled", "quizzical"]);
	});

	it("连续戳弄后伸展并重置睡眠进程", () => {
		const { character, clock, document } = createHarness();
		clock.advance(10 * 60_000);
		for (const pointerId of [10, 11, 12]) {
			document.body.dispatch("pointerdown", { button: 0, pointerId, clientX: 20, clientY: 30 });
			document.body.dispatch("pointerup", { pointerId });
			clock.advance(pointerId === 10 ? 650 + 2200 : 2200);
		}
		expect(latest(character).pose).toBe("stretching");
		clock.advance(3500 + 700 + 900);
		expect(latest(character).pose).toBe("idle");
		clock.advance(60_000);
		expect(latest(character).pose).not.toBe("drowsy");
	});

	it("Agent 活动期间拖动结束后直接恢复活动", () => {
		const { api, character, clock, document } = createHarness();
		api.update({ activity: "thinking" });
		clock.advance(2000);
		document.body.dispatch("pointerdown", { button: 0, pointerId: 13, clientX: 20, clientY: 30 });
		expect(latest(character).pose).toBe("dragging");
		document.body.dispatch("pointerup", { pointerId: 13 });
		expect(latest(character).pose).toBe("thinking");
		expect(character.scenes.slice(-2).map((scene) => scene.pose)).toEqual(["dragging", "thinking"]);
	});


	it("销毁活动拖动时结束原生会话并清除指针状态", () => {
		const { api, document, drags } = createHarness();
		document.body.dispatch("pointerdown", { button: 0, pointerId: 41, clientX: 20, clientY: 30 });
		api.destroy();
		expect(drags).toEqual([{ phase: "start" }, { phase: "end" }]);
		expect(document.body.classes.has("dragging")).toBe(false);
	});

	it("销毁时释放监听、计时器和角色", () => {
		const { api, character, clock, document, motion } = createHarness();
		api.destroy();
		clock.advance(10_000);
		expect(character.destroyed).toBe(true);
		expect(character.scenes).toHaveLength(1);
		expect(document.listeners.get("visibilitychange")?.size).toBe(0);
		expect(motion.listeners.get("change")?.size).toBe(0);
		expect(document.body.listeners.get("lostpointercapture")?.size).toBe(0);
		expect(document.body.listeners.get("pointerenter")?.size).toBe(0);
		expect(api.update({ activity: "thinking" })).toBe(false);
	});
});
