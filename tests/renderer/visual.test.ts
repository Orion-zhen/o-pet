import { describe, expect, it } from "vitest";

import { ClockStub, DocumentStub, MotionQueryStub, SvgElementStub } from "./browser-stubs.js";
import {
	createVisualHarness, hasLiveTrail, renderedEyeCenters, renderedEyeSizes, svgHash,
} from "./visual-fixture.js";

const SHAPES = [
	"blob", "pebble", "bean", "egg", "squircle", "tablet", "capsule", "cylinder", "hex",
	"gem", "crystal", "wedge", "shield", "dome", "arch", "cloud", "teardrop", "leaf",
];

function visibleBodyColoredDots(root: SvgElementStub): SvgElementStub[] {
	const dots: SvgElementStub[] = [];
	const visit = (element: SvgElementStub): void => {
		if (
			element.attributes.get("style") === "fill:var(--fg);display:none"
			&& element.style.display === ""
		) dots.push(element);
		for (const child of element.children) visit(child);
	};
	visit(root);
	return dots;
}

function visibleBodyColoredRings(root: SvgElementStub): SvgElementStub[] {
	const rings: SvgElementStub[] = [];
	const visit = (element: SvgElementStub): void => {
		if (
			element.tag === "circle"
			&& element.attributes.get("fill") === "none"
			&& element.style.display === ""
		) rings.push(element);
		for (const child of element.children) visit(child);
	};
	visit(root);
	return rings;
}

describe("渲染器视觉运行时", () => {
	it.each([
		["spawning", 3],
		["deepThinking", 2],
		["consulting", 5],
		["humming", 2],
	])("%s 的周边圆点显式使用身体颜色", (scene, expectedDots) => {
		const harness = createVisualHarness();
		const preset = harness.presets.scenes[scene];
		if (preset === undefined) throw new Error(`缺少 ${scene} 场景`);
		harness.character.setInk("#789abc");
		harness.character.playPreset(preset);
		for (let time = 16; time <= 1504; time += 16) harness.frame(time);

		const dots = visibleBodyColoredDots(harness.svg);
		expect(dots).toHaveLength(expectedDots);
		for (const dot of dots) expect(dot.style.fill).toBe("#789abc");
		harness.character.destroy();
	});

	it("radar 的扩散波纹显式使用身体颜色", () => {
		const harness = createVisualHarness();
		harness.character.setInk("#789abc");
		harness.character.playPreset(harness.presets.scenes.radar);
		for (let time = 16; time <= 1504; time += 16) harness.frame(time);

		const rings = visibleBodyColoredRings(harness.svg);
		expect(rings).toHaveLength(3);
		for (const ring of rings) expect(ring.style.stroke).toBe("#789abc");
		harness.character.destroy();
	});

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

	it("happy 进入后执行弹跳，减少动态模式下跳过", () => {
		const moving = createVisualHarness();
		moving.character.playPreset(moving.presets.scenes.happy);
		for (let time = 16; time <= 160; time += 16) moving.frame(time);
		expect(moving.character.hopAt).toBeGreaterThanOrEqual(120);
		for (let time = 176; time <= 1392; time += 16) moving.frame(time);
		expect(moving.character.hopAt).toBe(-1);
		moving.character.destroy();

		const reduced = createVisualHarness();
		reduced.character.setReduceMotion(true);
		reduced.character.playPreset(reduced.presets.scenes.happy);
		for (let time = 16; time <= 160; time += 16) reduced.frame(time);
		expect(reduced.character.hopAt).toBe(-1);
		reduced.character.destroy();
	});

	it.each([0.49, 0.5])("playful 的旋转分支 %s 会生成旋转轨迹", (random) => {
		const harness = createVisualHarness(() => random);
		harness.character.playPreset(harness.presets.scenes.playful);
		for (let time = 16; time <= 400; time += 16) harness.frame(time);
		expect(hasLiveTrail(harness.svg)).toBe(true);
		for (let time = 416; time <= 2992; time += 16) harness.frame(time);
		expect(harness.character.spinTurn).toBeNull();
		expect(harness.character.trick).toBeNull();
		harness.character.destroy();
	});

	it("searching 的最长首次旋转会在空闲场景窗口内完成", () => {
		const harness = createVisualHarness(() => 1);
		harness.character.playPreset(harness.presets.scenes.searching);
		for (let time = 16; time <= 1600; time += 16) harness.frame(time);
		expect(harness.character.spinTurn).not.toBeNull();
		for (let time = 1616; time <= 3488; time += 16) harness.frame(time);
		expect(harness.character.spinTurn).toBeNull();
		harness.character.destroy();
	});

	it("proud 完成整圈并稳定后才开始弹跳", () => {
		const harness = createVisualHarness();
		harness.character.playPreset(harness.presets.scenes.proud);
		for (let time = 16; time <= 400; time += 16) harness.frame(time);
		expect(hasLiveTrail(harness.svg)).toBe(true);

		for (let time = 416; time <= 832; time += 16) harness.frame(time);
		expect(harness.character.hopAt).toBe(-1);
		expect(Math.abs(harness.character.extras.turnRadians ?? 0)).toBeCloseTo(
			Math.PI * 2,
			10,
		);

		for (let time = 848; time <= 896; time += 16) harness.frame(time);
		expect(harness.character.hopAt).toBe(-1);
		harness.frame(912);
		expect(harness.character.hopAt).toBe(912);
		expect(Math.abs(harness.character.extras.turnRadians ?? 0)).toBeCloseTo(
			Math.PI * 2,
			10,
		);

		for (let time = 928; time <= 2080; time += 16) harness.frame(time);
		expect(harness.character.hopAt).toBe(-1);
		expect(harness.character.extras.turnRadians).toBeNull();
		harness.character.destroy();
	});

	it.each(SHAPES)("front 在 %s 身形上将眼睛放在脸部正中", (shape) => {
		const harness = createVisualHarness();
		harness.character.setReduceMotion(true);
		harness.character.setShape(shape);
		harness.character.playPreset(harness.presets.scenes.front);
		for (let time = 16; time <= 2000; time += 16) harness.frame(time);
		const centers = renderedEyeCenters(harness.svg);
		const sizes = renderedEyeSizes(harness.svg);
		const expected = harness.faceCenter(shape);
		expect(harness.character.eyeTo).toBe(25);
		expect(centers).toHaveLength(2);
		const [left, right] = centers;
		if (left === undefined || right === undefined)
			throw new Error("缺少正面眼形");
		expect((left.x + right.x) / 2).toBeCloseTo(expected.x, 0);
		expect((left.y + right.y) / 2).toBeCloseTo(expected.y, 0);
		expect(left.y).toBeCloseTo(right.y, 1);
		for (const size of sizes) {
			expect(size.width).toBeGreaterThan(12);
			expect(size.height).toBeGreaterThan(25);
		}
		harness.character.destroy();
	});

	it.each(["jumping", "quickHappy"])("%s 只复用基础运动，不继承入场编排", (scene) => {
		const harness = createVisualHarness();
		harness.character.playPreset(harness.presets.scenes[scene]);
		for (let time = 16; time <= 400; time += 16) harness.frame(time);
		expect(hasLiveTrail(harness.svg)).toBe(false);
		expect(harness.character.hopAt).toBe(-1);
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
			["spawning@0", "819572600225af4e"],
			["spawning@16", "29b7c2124cf20fad"],
			["coding@2016", "a1a27b3daf3b4840"],
			["coding@2500", "ca5416810a31dada"],
			["loading@5016", "0a7085e60fbaa392"],
			["loading@5800", "4cb052293799919c"],
			["receiving@7016", "50f178358c3e185d"],
			["receiving@7800", "0b39c5447baf5d5a"],
			["quizzical@9016", "08bc4d7f7912f5d0"],
			["quizzical@9900", "8c3b8baac2e86913"],
			["cloud@11016", "a0d19b71eb57be6c"],
			["cloud@11800", "23bc63b271ff82e5"],
			["spin@13016", "d3ca58cc195a1981"],
			["spin@13700", "07b762adda95c15e"],
			["wink-pounce@15016", "71f01a37b150a1c2"],
			["wink-pounce@15320", "a627ca9ebe4714f6"],
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
