import { describe, expect, it } from "vitest";

import { ClockStub, DocumentStub, MotionQueryStub, SvgElementStub } from "./browser-stubs.js";
import { createVisualHarness, hasLiveTrail, svgHash } from "./visual-fixture.js";

describe("渲染器视觉运行时", () => {
	it("重新播放同名预设时重置各动画通道的时间轴", () => {
		const harness = createVisualHarness();
		const sleeping = harness.presets.scenes.sleeping;
		if (sleeping === undefined) throw new Error("缺少 sleeping 场景");

		harness.setTime(1000);
		harness.character.playPreset(harness.presets.scenes.sleeping);
		const firstContext = harness.character.ctx;
		expect(harness.character.motionAt).toBe(1000);
		expect(harness.character.faceAt).toBe(1000);

		harness.setTime(5000);
		harness.character.playPreset(harness.presets.scenes.sleeping);
		expect(harness.character.motionAt).toBe(5000);
		expect(harness.character.faceAt).toBe(5000);
		expect(harness.character.ctx).not.toBe(firstContext);
		expect(harness.character.celebrateAt).toBeNull();

		const loading = harness.presets.scenes.loading;
		if (loading === undefined) throw new Error("缺少 loading 场景");
		harness.setTime(6000);
		harness.character.playPreset(harness.presets.scenes.loading);
		harness.setTime(8000);
		harness.character.playPreset(harness.presets.scenes.loading);
		expect(harness.character.particleAt).toBe(8000);
		harness.character.destroy();
	});

	it("重播静态预设不会把姿态重置误判为旋转动作", () => {
		const harness = createVisualHarness();
		const playCycle = (start: number): void => {
			harness.setTime(start);
			harness.character.playPreset(harness.presets.scenes.sleeping);
			harness.character.setPaused(false);
			for (let time = start + 16; time <= start + 3000; time += 16) harness.frame(time);
			harness.setTime(start + 3000);
			harness.character.setPaused(true);
		};

		playCycle(0);
		playCycle(4000);
		playCycle(8000);
		expect(hasLiveTrail(harness.svg)).toBe(false);
		harness.character.destroy();
	});

	it("显式庆祝旋转仍会生成旋转轨迹", () => {
		const harness = createVisualHarness();
		harness.character.playPreset(harness.presets.scenes.celebrate);
		for (let time = 16; time <= 1200; time += 16) harness.frame(time);
		expect(hasLiveTrail(harness.svg)).toBe(true);
		harness.character.destroy();
	});

	it("关键 SVG 帧与重构前的视觉基线一致", () => {
		const harness = createVisualHarness();
		const hashes: Array<[string, string]> = [];
		const record = (label: string, time?: number): void => {
			if (time !== undefined) harness.frame(time);
			hashes.push([label, svgHash(harness.svg)]);
		};
		const enter = (name: string, time: number, details?: Record<string, unknown>): void => {
			const preset = harness.presets.scenes[name];
			if (preset === undefined) throw new Error(`缺少场景 ${name}`);
			harness.setTime(time);
			harness.character.setPreset(
				details === undefined ? preset : harness.presets.withDetails(preset, details),
			);
		};

		record("spawning@0");
		record("spawning@16", 16);
		enter("coding", 2000);
		record("coding@2016", 2016);
		record("coding@2500", 2500);
		enter("loading", 5000);
		record("loading@5016", 5016);
		record("loading@5800", 5800);
		enter("receiving", 7000);
		record("receiving@7016", 7016);
		record("receiving@7800", 7800);
		enter("quizzical", 9000, { direction: 1 });
		record("quizzical@9016", 9016);
		record("quizzical@9900", 9900);
		harness.setTime(11_000);
		harness.character.setShape("cloud");
		record("cloud@11016", 11_016);
		record("cloud@11800", 11_800);
		harness.setTime(13_000);
		harness.character.spinOnce(2, -1);
		record("spin@13016", 13_016);
		record("spin@13700", 13_700);
		harness.setTime(15_000);
		harness.character.winkOnce(0);
		harness.character.pounceOnce(1, 0.7);
		record("wink-pounce@15016", 15_016);
		record("wink-pounce@15320", 15_320);
		harness.character.destroy();

		expect(hashes).toEqual([
			["spawning@0", "1955d3d2b713acdd"],
			["spawning@16", "7dfcb20a7f8b8f5e"],
			["coding@2016", "2553c4abddc648c0"],
			["coding@2500", "2774aa793d24956e"],
			["loading@5016", "4ceb4ac81639e87f"],
			["loading@5800", "450ee61df0cd5790"],
			["receiving@7016", "2bc241e7ae7f5034"],
			["receiving@7800", "cdc06df5d8b2e4ee"],
			["quizzical@9016", "06c80910b5024253"],
			["quizzical@9900", "63c2c48d9196134d"],
			["cloud@11016", "6c62a5c6c171ec6b"],
			["cloud@11800", "ef631bd7db84dce3"],
			["spin@13016", "e6e4e2ffce717860"],
			["spin@13700", "875d1dd18171029a"],
			["wink-pounce@15016", "a6f67525b95b8b27"],
			["wink-pounce@15320", "dd419c0427ef8a6c"],
		]);
	});

	it("组合根可装配完整动画引擎", () => {
		const visual = createVisualHarness();
		const clock = new ClockStub();
		const document = new DocumentStub();
		const motionQuery = new MotionQueryStub();
		const svg = new SvgElementStub("svg");
		const api = visual.factory.create({
			clock,
			document,
			frameClock: clock,
			motionQuery,
			now: () => clock.now,
			pointerTarget: document.body,
			postDrag: () => {},
			random: () => 0.5,
			svg,
			viewportWidth: () => 1,
		});
		clock.advance(2000);
		expect(api.update({ activity: "coding" })).toBe(true);
		clock.advance(350);
		expect(svg.children.length).toBeGreaterThan(0);
		api.destroy();
		visual.character.destroy();
	});

	it("动画运行时销毁后不能被恢复操作重新启动", () => {
		const harness = createVisualHarness();
		expect(harness.pendingFrames()).toBe(1);
		harness.character.setPaused(true);
		expect(harness.pendingFrames()).toBe(0);
		harness.character.destroy();
		harness.character.setPaused(false);
		expect(harness.pendingFrames()).toBe(0);
	});
});
