import { describe, expect, it } from "vitest";

import { createHarness, latest } from "./host-fixture.js";

describe("渲染器组合根行为", () => {
	it("按名称循环预览动画预设并在轮次间暂停一秒", () => {
		const { api, character, clock } = createHarness();
		api.showAction("happy");
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
	});

	it("预览拒绝活动更新并保持当前动作", () => {
		const { api, character, clock } = createHarness();
		api.showAction("happy");

		expect(api.update({ activity: "thinking" })).toBe(false);
		clock.advance(4000);
		expect(latest(character).pose).toBe("happy");
		expect(character.playedStates).toEqual(["happy", "happy"]);
	});

	it("普通模式接受活动更新", () => {
		const { api, character, clock } = createHarness();
		clock.advance(2000);
		expect(api.update({ activity: "thinking" })).toBe(true);
		clock.advance(350);
		expect(latest(character).pose).toBe("thinking");
	});

	it("front 预览组合正面注意姿态和锁定视线", () => {
		const { api, character } = createHarness();
		api.showAction("front");
		expect(latest(character)).toMatchObject({
			pose: "listening",
			expression: "front",
			gaze: "front",
		});
	});

	it("thinking-alt 预览组合 cloud 身形和思考圆点", () => {
		const { api, character } = createHarness();
		api.showAction("thinking-alt");
		expect(latest(character)).toMatchObject({
			pose: "thinking-alt",
			expression: "thinking",
			effect: "thinking-alt",
			gaze: "thinking",
			shape: "cloud",
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

	it("预览拖动跨越暂停和下一轮时持续显示 dragging", () => {
		const { api, character, clock, document } = createHarness();
		api.showAction("happy");
		document.body.dispatch("pointerdown", {
			button: 0,
			pointerId: 1,
			clientX: 20,
			clientY: 30,
		});
		document.body.dispatch("pointermove", {
			buttons: 1,
			pointerId: 1,
			clientX: 27,
			clientY: 30,
		});
		expect(latest(character).pose).toBe("dragging");

		clock.advance(4000);
		expect(latest(character).pose).toBe("dragging");
		expect(character.paused).not.toContain(true);
		expect(character.playedStates).toEqual(["happy"]);

		document.body.dispatch("pointerup", { pointerId: 1 });
		expect(latest(character).pose).toBe("happy");
		expect(character.playedStates).toEqual(["happy", "happy"]);
	});

	it("预览暂停期间拖动会临时恢复帧循环并在松开后恢复暂停", () => {
		const { api, character, clock, document } = createHarness();
		api.showAction("happy");
		clock.advance(3000);
		expect(character.paused.at(-1)).toBe(true);

		document.body.dispatch("pointerdown", {
			button: 0,
			pointerId: 2,
			clientX: 20,
			clientY: 30,
		});
		document.body.dispatch("pointermove", {
			buttons: 1,
			pointerId: 2,
			clientX: 27,
			clientY: 30,
		});
		expect(latest(character).pose).toBe("dragging");
		expect(character.paused.at(-1)).toBe(false);

		document.body.dispatch("pointerup", { pointerId: 2 });
		expect(latest(character).pose).toBe("happy");
		expect(character.paused.at(-1)).toBe(true);
		expect(character.renderCount).toBe(1);

		clock.advance(1000);
		expect(character.paused.at(-1)).toBe(false);
	});

	it("启动时间线结束前持续拖动时保留覆盖并在松开后显示当前活动", () => {
		const { character, clock, document } = createHarness();
		document.body.dispatch("pointerdown", {
			button: 0,
			pointerId: 3,
			clientX: 20,
			clientY: 30,
		});
		document.body.dispatch("pointermove", {
			buttons: 1,
			pointerId: 3,
			clientX: 27,
			clientY: 30,
		});
		clock.advance(2000);
		expect(latest(character).pose).toBe("dragging");

		document.body.dispatch("pointerup", { pointerId: 3 });
		expect(latest(character).pose).toBe("idle");
	});

	it.each([
		["thinking", "thinking", null],
		["searching", "searching", null],
		["coding", "working", "writing"],
		["receiving", "working", "receiving"],
		["consulting", "thinking", "orbit"],
		["tooling", "working", "orbit"],
	] as const)("将 %s 活动组合为姿态和特效通道", (activity, pose, effect) => {
		const { api, character, clock } = createHarness();
		api.update({ activity });
		clock.advance(2000);
		expect(latest(character)).toMatchObject({ pose, effect });
	});

	it("从其他活动进入回复时先回正并收起工具特效", () => {
		const { api, character, clock } = createHarness();
		clock.advance(2000);
		api.update({ activity: "coding" });
		clock.advance(350);
		expect(latest(character).effect).toBe("writing");

		api.update({ activity: "replying" });
		clock.advance(349);
		expect(latest(character).effect).toBe("writing");
		clock.advance(1);
		expect(latest(character)).toMatchObject({
			pose: "replyPreparing",
			expression: "front",
			effect: null,
			gaze: "front",
		});
		clock.advance(600);
		expect(latest(character)).toMatchObject({
			pose: "listening",
			effect: "dictating",
		});
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
		expect(new Set(storyStarts.slice(0, 3)).size).toBe(3);
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

	it("thinking-alt 以仅次于 humming 的权重进入思考强调段", () => {
		const { api, character, clock } = createHarness(false, () => 0.5);
		api.update({ activity: "thinking" });
		clock.advance(2000);
		expect(latest(character).pose).toBe("thinking");
		clock.advance(4500);
		expect(latest(character)).toMatchObject({
			pose: "thinking-alt",
			effect: "thinking-alt",
			shape: "cloud",
		});
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

	it("回复先收束波形并直接变为发送形变，再播放完成反馈", () => {
		const { api, character, clock } = createHarness();
		api.update({ activity: "replying" });
		clock.advance(2600);
		expect(latest(character).effect).toBe("dictating");

		api.update({ activity: "replying", cue: "reply_sent" });
		expect(latest(character)).toMatchObject({
			pose: "replyClosing",
			effect: "dictating",
		});
		api.update({ activity: "idle", cue: "completed_normal" });
		clock.advance(279);
		expect(latest(character).effect).toBe("dictating");
		clock.advance(1);
		expect(latest(character).effect).toBe("sending");
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

	it("应用原生配置和系统动态偏好", () => {
		const { api, character, motion } = createHarness();
		const bodyPaint = { kind: "solid", color: "#123456" } as const;
		api.setPreferences({
			body_color: bodyPaint,
			eye_color: "#abcdef",
			shape: "cloud",
		});
		expect(character.shapes).toEqual(["cloud"]);
		expect(character.bodyColors).toEqual([bodyPaint]);
		expect(character.eyeColors).toEqual(["#abcdef"]);

		motion.matches = true;
		motion.dispatch("change");
		expect(character.reducedMotion.at(-1)).toBe(true);
	});

	it("超过位移阈值后才开始拖动，并按动画帧合并移动", () => {
		const { clock, character, document, drags } = createHarness();
		document.body.dispatch("pointerdown", { button: 0, pointerId: 4, clientX: 20, clientY: 30 });
		expect(latest(character).pose).toBe("touched");
		expect(drags).toEqual([]);
		document.body.dispatch("pointermove", { buttons: 1, pointerId: 4, clientX: 21, clientY: 29 });
		expect(latest(character).pose).toBe("touched");
		document.body.dispatch("pointermove", { buttons: 1, pointerId: 4, clientX: 27, clientY: 25 });
		expect(latest(character).pose).toBe("dragging");
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

	it("短按播放轻触回应且不移动窗口", () => {
		const { character, clock, document, drags } = createHarness();
		clock.advance(2000);
		document.body.dispatch("pointerdown", { button: 0, pointerId: 42, clientX: 20, clientY: 30 });
		expect(latest(character).pose).toBe("touched");
		document.body.dispatch("pointerup", { pointerId: 42 });
		expect(latest(character).pose).toBe("booped");
		expect(drags).toEqual([]);
		clock.advance(420);
		expect(latest(character)).toMatchObject({ pose: "listening", gaze: "front" });
		clock.advance(650);
		expect(latest(character).pose).toBe("idle");
	});

	it("清醒时连续轻触会转为玩耍而不是重复唤醒", () => {
		const { character, clock, document } = createHarness();
		clock.advance(2000);
		for (const pointerId of [44, 45, 46]) {
			document.body.dispatch("pointerdown", {
				button: 0,
				pointerId,
				clientX: 20,
				clientY: 30,
			});
			document.body.dispatch("pointerup", { pointerId });
			clock.advance(420 + 650);
		}
		expect(latest(character).pose).toBe("playful");
		clock.advance(1200);
		expect(latest(character)).toMatchObject({
			pose: "happy",
			expression: "winking",
		});
		clock.advance(700);
		expect(latest(character).pose).toBe("idle");
	});

	it("长按进入抚摸并在释放后开心回应", () => {
		const { character, clock, document, drags } = createHarness();
		clock.advance(2000);
		document.body.dispatch("pointerdown", { button: 0, pointerId: 43, clientX: 20, clientY: 30 });
		clock.advance(419);
		expect(latest(character).pose).toBe("touched");
		clock.advance(1);
		expect(latest(character)).toMatchObject({ pose: "petting", expression: "petting" });
		expect(document.body.classes.has("petting")).toBe(true);
		document.body.dispatch("pointermove", {
			buttons: 1,
			pointerId: 43,
			clientX: 35,
			clientY: 30,
		});
		expect(latest(character).pose).toBe("petting");
		document.body.dispatch("pointerup", { pointerId: 43 });
		expect(latest(character).pose).toBe("happy");
		expect(drags).toEqual([]);
		clock.advance(700);
		expect(latest(character).pose).toBe("idle");
		expect(document.body.classes.has("petting")).toBe(false);
	});

	it("鼠标进入后先追踪鼠标，再回正看向用户", () => {
		const { character, clock, document } = createHarness();
		clock.advance(2000);
		document.body.dispatch("pointerenter");
		expect(latest(character)).toMatchObject({ pose: "curious", gaze: "curious" });
		clock.advance(500);
		expect(latest(character)).toMatchObject({ pose: "listening", gaze: "front" });
	});

	it("困倦阶段仍会播放片段并反复回到 drowsy", () => {
		const { character, clock } = createHarness();
		clock.advance(4 * 60_000 + 30_000);
		const firstReturns = character.scenes.filter((scene) => scene.pose === "drowsy").length;
		expect(firstReturns).toBeGreaterThan(0);
		clock.advance(60_000);
		const laterReturns = character.scenes.filter((scene) => scene.pose === "drowsy").length;
		expect(laterReturns).toBeGreaterThan(firstReturns);
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

	it.each([
		[0, 15 * 60_000],
		[0.999, 23 * 60_000 - 480],
	] as const)("睡眠持续 5–8 分钟后自然伸展醒来（随机值 %s）", (random, wakeAt) => {
		const { character, clock } = createHarness(false, () => random);
		clock.advance(wakeAt - 1);
		expect(["sleeping", "dreaming"]).toContain(latest(character).pose);
		clock.advance(1);
		expect(latest(character).pose).toBe("stretching");
		expect(character.scenes.some((scene) => scene.pose === "waking")).toBe(false);
	});

	it("自然醒后开心并重新开始完整空闲周期", () => {
		const { character, clock } = createHarness(false, () => 0.5);
		clock.advance(19 * 60_000);
		const firstDirection = latest(character).direction;
		if (firstDirection === undefined) throw new Error("自然醒缺少伸展方向");
		expect(latest(character).pose).toBe("stretching");

		clock.advance(3500);
		expect(latest(character).pose).toBe("happy");
		clock.advance(1400);
		expect(latest(character).pose).toBe("idle");

		clock.advance(38 * 60_000 - clock.now);
		expect(latest(character).pose).toBe("stretching");
		expect(latest(character).direction).toBe(-firstDirection);
	});

	it("自然醒偶尔以眨眼表达睡得很好", () => {
		const { character, clock } = createHarness(false, () => 0);
		clock.advance(15 * 60_000 + 3500);
		expect(latest(character).pose).toBe("happy");
		expect(character.winkCount).toBe(1);
	});

	it("唤醒时间线结束前持续拖动时保留覆盖并在松开后显示当前活动", () => {
		const { api, character, clock, document } = createHarness();
		clock.advance(10 * 60_000);
		api.update({ activity: "thinking" });
		clock.advance(350);
		expect(latest(character).pose).toBe("waking");

		document.body.dispatch("pointerdown", {
			button: 0,
			pointerId: 6,
			clientX: 20,
			clientY: 30,
		});
		document.body.dispatch("pointermove", {
			buttons: 1,
			pointerId: 6,
			clientX: 27,
			clientY: 30,
		});
		clock.advance(1800);
		expect(latest(character).pose).toBe("dragging");

		document.body.dispatch("pointerup", { pointerId: 6 });
		expect(latest(character).pose).toBe("thinking");
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
		expect(character.scenes.some((scene) => scene.pose === "drowsy")).toBe(true);
		api.update({ activity: "thinking" });
		clock.advance(350);
		expect(latest(character).pose).toBe("waking");
	});

	it("困倦拖动结束后面向用户询问，再回到 drowsy", () => {
		const { character, clock, document } = createHarness();
		clock.advance(4 * 60_000);
		document.body.dispatch("pointerdown", { button: 0, pointerId: 7, clientX: 20, clientY: 30 });
		document.body.dispatch("pointermove", { buttons: 1, pointerId: 7, clientX: 27, clientY: 30 });
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
			document.body.dispatch("pointermove", { buttons: 1, pointerId, clientX: 27, clientY: 30 });
			document.body.dispatch("pointerup", { pointerId });
			directions.push(latest(character).direction);
			expect(latest(character).gaze).toBe("front");
			clock.advance(2200);
		}
		const [first, second] = directions;
		if (first === undefined || second === undefined) throw new Error("缺少询问方向");
		expect(first).toBe(-second);
	});

	it("睡眠时超过位移阈值才开始拖动，并在惊醒后显示 dragging", () => {
		const { character, clock, document, drags } = createHarness();
		clock.advance(10 * 60_000);
		document.body.dispatch("pointerdown", { button: 0, pointerId: 8, clientX: 20, clientY: 30 });
		expect(drags).toEqual([]);
		document.body.dispatch("pointermove", { buttons: 1, pointerId: 8, clientX: 27, clientY: 30 });
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
		const { character, clock, document, motion } = createHarness();
		motion.matches = true;
		motion.dispatch("change");
		clock.advance(10 * 60_000);
		document.body.dispatch("pointerdown", { button: 0, pointerId: 23, clientX: 20, clientY: 30 });
		document.body.dispatch("pointermove", { buttons: 1, pointerId: 23, clientX: 27, clientY: 30 });
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
		document.body.dispatch("pointermove", { buttons: 1, pointerId: 13, clientX: 27, clientY: 30 });
		expect(latest(character).pose).toBe("dragging");
		document.body.dispatch("pointerup", { pointerId: 13 });
		expect(latest(character).pose).toBe("thinking");
		expect(character.scenes.slice(-2).map((scene) => scene.pose)).toEqual(["dragging", "thinking"]);
	});


	it("销毁预览拖动时不再恢复或渲染基础场景", () => {
		const { api, character, clock, document } = createHarness();
		api.showAction("happy");
		clock.advance(3000);
		document.body.dispatch("pointerdown", {
			button: 0,
			pointerId: 40,
			clientX: 20,
			clientY: 30,
		});
		document.body.dispatch("pointermove", {
			buttons: 1,
			pointerId: 40,
			clientX: 27,
			clientY: 30,
		});

		api.destroy();
		expect(character.renderCount).toBe(0);
		expect(character.destroyed).toBe(true);
	});

	it("销毁活动拖动时结束原生会话并清除指针状态", () => {
		const { api, document, drags } = createHarness();
		document.body.dispatch("pointerdown", { button: 0, pointerId: 41, clientX: 20, clientY: 30 });
		document.body.dispatch("pointermove", { buttons: 1, pointerId: 41, clientX: 27, clientY: 30 });
		api.destroy();
		expect(drags).toEqual([
			{ phase: "start" },
			{ phase: "move", dx: 7, dy: 0 },
			{ phase: "end" },
		]);
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
		expect(character.scenes).toHaveLength(1);
	});
});
