import { describe, expect, it } from "vitest";

import { ClockStub, DocumentStub, MotionQueryStub, SvgElementStub } from "./browser-stubs.js";
import {
	createVisualHarness, hasLiveTrail, renderedEyeCenters, renderedEyeSizes, svgHash,
} from "./visual-fixture.js";

const SHAPES = [
	"blob", "pebble", "bean", "egg", "squircle", "tablet", "capsule", "cylinder", "hex",
	"gem", "crystal", "wedge", "shield", "dome", "arch", "cloud", "teardrop", "leaf",
];

function elementsByTag(root: SvgElementStub, tag: string): SvgElementStub[] {
	const matches: SvgElementStub[] = [];
	const visit = (element: SvgElementStub): void => {
		if (element.tag === tag) matches.push(element);
		for (const child of element.children) visit(child);
	};
	visit(root);
	return matches;
}

const solidPaint = (color: string): { color: string; kind: string } => ({
	kind: "solid",
	color,
});

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

function visibleBodyColoredCircles(root: SvgElementStub): SvgElementStub[] {
	const circles: SvgElementStub[] = [];
	const visit = (element: SvgElementStub): void => {
		if (
			element.tag === "circle"
			&& element.attributes.get("style") === "fill:var(--fg);display:none"
			&& element.style.display === ""
		) circles.push(element);
		for (const child of element.children) visit(child);
	};
	visit(root);
	return circles;
}

describe("渲染器视觉运行时", () => {
	it("用 SVG 绘制线性渐变并保留代表色", () => {
		const harness = createVisualHarness();
		harness.character.setInk({
			kind: "linear",
			angle: 90,
			accent: "#800080",
			stops: [
				{ offset: 0, color: "#ff0000", opacity: 1 },
				{ offset: 1, color: "#0000ff", opacity: 1 },
			],
		});

		expect(harness.svg.style["--fg"]).toBe("#800080");
		const gradients = elementsByTag(harness.svg, "linearGradient");
		expect(gradients).toHaveLength(1);
		const gradient = gradients[0];
		if (gradient === undefined) throw new Error("缺少线性渐变");
		expect(gradient.attributes.get("x1")).toBe("0%");
		expect(gradient.attributes.get("x2")).toBe("100%");
		expect(elementsByTag(gradient, "stop").map((stop) => Object.fromEntries(stop.attributes))).toEqual([
			{ offset: "0%", "stop-color": "#ff0000", "stop-opacity": "1" },
			{ offset: "100%", "stop-color": "#0000ff", "stop-opacity": "1" },
		]);
		const paintedBodies = elementsByTag(harness.svg, "path").filter((path) =>
			path.attributes.get("fill")?.startsWith("url(#body-paint-")
		);
		expect(paintedBodies).toHaveLength(1);
		harness.character.destroy();
	});

	it("为径向渐变创建随身体同步的模糊光晕，并能切回单色", () => {
		const harness = createVisualHarness();
		harness.character.setInk({
			kind: "radial",
			center: [0.35, 0.3],
			accent: "#a855f7",
			blur: 10,
			stops: [
				{ offset: 0, color: "#ffffff", opacity: 1 },
				{ offset: 1, color: "#a855f7", opacity: 0 },
			],
		});
		harness.frame(16);

		const gradients = elementsByTag(harness.svg, "radialGradient");
		expect(gradients).toHaveLength(1);
		expect(gradients[0]?.attributes.get("cx")).toBe("35%");
		expect(gradients[0]?.attributes.get("cy")).toBe("30%");
		expect(elementsByTag(harness.svg, "feGaussianBlur")[0]?.attributes.get("stdDeviation")).toBe("10");
		const glow = elementsByTag(harness.svg, "path").find((path) => path.attributes.has("filter"));
		const body = elementsByTag(harness.svg, "path").find((path) =>
			path !== glow && path.attributes.get("fill")?.startsWith("url(#body-paint-")
		);
		expect(glow?.attributes.get("d")).toBe(body?.attributes.get("d"));

		harness.character.setInk(solidPaint("#123456"));
		expect(elementsByTag(harness.svg, "radialGradient")).toHaveLength(0);
		expect(elementsByTag(harness.svg, "feGaussianBlur")).toHaveLength(0);
		expect(elementsByTag(harness.svg, "path").filter((path) => path.attributes.has("filter"))).toHaveLength(0);
		expect(elementsByTag(harness.svg, "path").some((path) => path.attributes.get("fill") === "#123456")).toBe(true);
		harness.character.destroy();
	});

	it.each([
		["spawning", 3],
		["deepThinking", 2],
		["consulting", 5],
		["humming", 2],
	])("%s 的周边圆点显式使用身体颜色", (scene, expectedDots) => {
		const harness = createVisualHarness();
		const preset = harness.presets.scenes[scene];
		if (preset === undefined) throw new Error(`缺少 ${scene} 场景`);
		harness.character.setInk(solidPaint("#789abc"));
		harness.character.playPreset(preset);
		for (let time = 16; time <= 1504; time += 16) harness.frame(time);

		const dots = visibleBodyColoredDots(harness.svg);
		expect(dots).toHaveLength(expectedDots);
		for (const dot of dots) expect(dot.style.fill).toBe("#789abc");
		harness.character.destroy();
	});

	it("thinking-alt 让圆点从身体后方进入，并由身体轮廓遮住进入的部分", () => {
		const harness = createVisualHarness();
		harness.character.setInk({
			kind: "linear",
			angle: 90,
			accent: "#789abc",
			stops: [
				{ offset: 0, color: "#ff0000", opacity: 1 },
				{ offset: 1, color: "#0000ff", opacity: 1 },
			],
		});
		harness.character.playPreset(harness.presets.scenes["thinking-alt"]);
		for (let time = 16; time <= 96; time += 16) harness.frame(time);
		const firstDot = visibleBodyColoredCircles(harness.svg)[0];
		if (firstDot === undefined) throw new Error("缺少思考圆点");
		const body = firstDot.parent?.children.find((element) =>
			element.tag === "path" && element.attributes.get("fill")?.startsWith("url(")
		);
		if (firstDot.parent === undefined || body === undefined)
			throw new Error("思考圆点没有位于身体图层");
		expect(firstDot.parent.children.indexOf(firstDot)).toBeLessThan(
			firstDot.parent.children.indexOf(body),
		);
		const startX = Number(firstDot.attributes.get("cx"));
		const startY = Number(firstDot.attributes.get("cy"));

		for (let time = 112; time <= 496; time += 16) harness.frame(time);
		const middleX = Number(firstDot.attributes.get("cx"));
		for (let time = 512; time <= 784; time += 16) harness.frame(time);
		const contactRadius = Number(firstDot.attributes.get("r"));
		const contactY = Number(firstDot.attributes.get("cy"));
		for (let time = 800; time <= 912; time += 16) harness.frame(time);
		const absorbedX = Number(firstDot.attributes.get("cx"));
		const absorbedY = Number(firstDot.attributes.get("cy"));
		const absorbedRadius = Number(firstDot.attributes.get("r"));
		const circles = visibleBodyColoredCircles(harness.svg);
		expect(circles.length).toBeGreaterThanOrEqual(2);
		for (const circle of circles) expect(circle.style.fill).toBe("#789abc");
		expect(middleX).toBeLessThan(startX);
		expect(startY - contactY).toBeGreaterThan(65);
		expect(middleX).toBeLessThan(absorbedX);
		expect(absorbedY).toBeLessThan(contactY);
		expect(contactRadius).toBeGreaterThan(12);
		expect(absorbedRadius).toBeCloseTo(contactRadius, 1);
		expect(Number(firstDot.attributes.get("opacity"))).toBeGreaterThan(0.8);
		harness.character.destroy();
	});

	it("thinking-alt 明显呼吸，并在吸收圆点前后拉伸和回弹", () => {
		const harness = createVisualHarness();
		harness.character.playPreset(harness.presets.scenes["thinking-alt"]);
		const body = elementsByTag(harness.svg, "path").find((element) =>
			element.attributes.get("fill") === "var(--fg, #000)"
		);
		if (body === undefined) throw new Error("缺少身体路径");
		const bodyPaths: string[] = [];
		const scaleX: number[] = [];
		const scaleY: number[] = [];
		const yPositions: number[] = [];
		for (let time = 16; time <= 3000; time += 16) {
			harness.frame(time);
			if (time < 1000) continue;
			bodyPaths.push(body.attributes.get("d") ?? "");
			scaleX.push(harness.character.squashX.x);
			scaleY.push(harness.character.squash.x);
			yPositions.push(harness.character.ty.x);
		}
		expect(new Set(bodyPaths).size).toBeGreaterThan(20);
		expect(Math.max(...scaleX)).toBeLessThan(0.96);
		expect(Math.max(...yPositions)).toBeLessThan(-3);
		expect(Math.max(...scaleX) - Math.min(...scaleX)).toBeGreaterThan(0.045);
		expect(Math.max(...scaleY) - Math.min(...scaleY)).toBeGreaterThan(0.1);
		expect(Math.max(...yPositions) - Math.min(...yPositions)).toBeGreaterThan(4.5);
		harness.character.destroy();
	});

	it("thinking-alt 丝滑切入 cloud 并在退出时恢复原身形", () => {
		const harness = createVisualHarness();
		const viewportScale = (): number => {
			const match = /^scale\(([\d.]+)\)$/.exec(String(harness.svg.style.transform));
			if (match?.[1] === undefined) throw new Error("视口缺少缩放");
			return Number(match[1]);
		};
		const blobScale = viewportScale();
		harness.setTime(1000);
		harness.character.playPreset(harness.presets.scenes["thinking-alt"]);
		expect(harness.character.preferredShapeName).toBe("blob");
		expect(harness.character.shapeName).toBe("cloud");
		expect(harness.character.shapeSpring.x).toBe(0);
		expect(viewportScale()).toBe(blobScale);

		harness.frame(1016);
		const firstEntryScale = viewportScale();
		expect(harness.character.shapeSpring.x).toBeGreaterThan(0);
		expect(harness.character.shapeSpring.x).toBeLessThan(1);
		expect(firstEntryScale).toBeGreaterThan(blobScale);
		for (let time = 1032; time <= 2000; time += 16) harness.frame(time);
		expect(harness.character.shapeSpring.x).toBeGreaterThan(0.99);
		const cloudScale = viewportScale();
		expect(cloudScale).toBeGreaterThan(firstEntryScale);

		harness.setTime(2000);
		harness.character.setPreset(harness.presets.scenes.idle);
		expect(harness.character.shapeName).toBe("blob");
		expect(harness.character.shapeSpring.x).toBe(0);
		expect(viewportScale()).toBe(cloudScale);
		harness.frame(2016);
		expect(harness.character.shapeSpring.x).toBeGreaterThan(0);
		expect(harness.character.shapeSpring.x).toBeLessThan(1);
		expect(viewportScale()).toBeLessThan(cloudScale);
		expect(viewportScale()).toBeGreaterThan(blobScale);
		harness.character.destroy();
	});

	it("radar 的扩散波纹显式使用身体颜色", () => {
		const harness = createVisualHarness();
		harness.character.setInk(solidPaint("#789abc"));
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

	it("front 的正面布局在切入和切出时连续过渡", () => {
		const harness = createVisualHarness();
		const midpoint = (): { x: number; y: number } => {
			const centers = renderedEyeCenters(harness.svg);
			const [left, right] = centers;
			if (left === undefined || right === undefined) throw new Error("缺少眼形");
			return { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
		};
		const distance = (
			left: { x: number; y: number },
			right: { x: number; y: number },
		): number => Math.hypot(left.x - right.x, left.y - right.y);

		harness.character.playPreset(harness.presets.scenes.curious);
		for (let time = 16; time <= 800; time += 16) harness.frame(time);
		const beforeEntry = midpoint();
		harness.setTime(800);
		harness.character.setPreset(harness.presets.scenes.front);
		harness.frame(816);
		const firstEntry = midpoint();
		expect(harness.character.frontBlend.x).toBeGreaterThan(0);
		expect(harness.character.frontBlend.x).toBeLessThan(1);
		for (let time = 832; time <= 1808; time += 16) harness.frame(time);
		const afterEntry = midpoint();
		expect(distance(beforeEntry, firstEntry)).toBeLessThan(
			distance(beforeEntry, afterEntry) * 0.35,
		);

		harness.setTime(1808);
		harness.character.setPreset(harness.presets.scenes.idle);
		harness.frame(1824);
		const firstExit = midpoint();
		expect(harness.character.frontBlend.x).toBeGreaterThan(0);
		expect(harness.character.frontBlend.x).toBeLessThan(1);
		for (let time = 1840; time <= 2816; time += 16) harness.frame(time);
		const afterExit = midpoint();
		expect(distance(afterEntry, firstExit)).toBeLessThan(
			distance(afterEntry, afterExit) * 0.35,
		);
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
			["cloud@11016", "3ed0626f4c02d228"],
			["cloud@11800", "7ec28ea5509b5737"],
			["spin@13016", "62b4e08b2b79625d"],
			["spin@13700", "6ae7082e501342ef"],
			["wink-pounce@15016", "0dc19cdb16dd3e9f"],
			["wink-pounce@15320", "6abf6e40e3acfd3e"],
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
		api.update({ activity: "coding" });
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
