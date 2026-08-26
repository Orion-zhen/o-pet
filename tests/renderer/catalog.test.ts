import { createHash } from "node:crypto";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

import {
	actionGroupsSource, choreographySource, expressionSource, gazeSource, geometryEngineSource,
	geometrySource, mathSource, motionSource, presetsSource, sequencesSource, tablesSource,
} from "./sources.js";

interface VisualPreset {
	channels: Record<string, { id: string | null }>;
	choreography?: string | null;
}

interface ChoreographyController {
	sample(
		scene: string,
		localSec: number,
		context: Record<string, unknown>,
	): Array<{ channel: string; type: string }>;
}

function createChoreography(random: number): ChoreographyController {
	const windowStub: Record<string, unknown> = {};
	windowStub.window = windowStub;
	const deterministicMath = Object.create(Math) as Math;
	deterministicMath.random = () => random;
	vm.runInNewContext(mathSource, { Math: deterministicMath, window: windowStub });
	vm.runInNewContext(choreographySource, { Math: deterministicMath, window: windowStub });
	const math = (windowStub.GROK_MATH as {
		create(source: () => number): unknown;
	}).create(deterministicMath.random);
	return (windowStub.GROK_CHOREOGRAPHY as {
		create(dependencies: unknown): ChoreographyController;
	}).create(math);
}

const freshChoreographyContext = (): Record<string, unknown> => ({
	happyBounced: false,
	playfulSpun: false,
	proudFlourished: false,
	wakingBurst: false,
});

describe("渲染器目录与控制通道", () => {
	it("内嵌全部眼睛、身形和配色数据", () => {
		const windowStub: Record<string, unknown> = {};
		windowStub.window = windowStub;
		vm.runInNewContext(geometrySource, windowStub);
		vm.runInNewContext(mathSource, windowStub);
		vm.runInNewContext(geometryEngineSource, windowStub);
		vm.runInNewContext(actionGroupsSource, windowStub);
		vm.runInNewContext(tablesSource, windowStub);
		const geometry = windowStub.GROK_GEO as {
			eyes: Array<Array<Array<[number, number]>>>;
			palette: Record<string, unknown>;
			shapes: Record<string, unknown>;
		};
		const math = (windowStub.GROK_MATH as { create(random: () => number): unknown }).create(() => 0.5);
		const geometryEngine = (windowStub.GROK_GEOMETRY as {
			create(dependencies: Record<string, unknown>): { shapeModel(name: string): { ring: number[][] } };
		}).create({ data: geometry, math });
		const tables = (windowStub.GROK_TABLES as {
			create(data: unknown, actionGroups: unknown): {
				BLINK_MS: Record<string, [number, number] | null>;
				EYE_PLAYLIST: Record<string, number[]>;
				GROUPS: Array<{ states: string[] }>;
			};
		}).create(geometry, windowStub.O_PET_ACTION_GROUPS);

		const states = tables.GROUPS.flatMap((group) => group.states);
		expect(states).toHaveLength(44);
		expect(states).toEqual(expect.arrayContaining([
			"startled", "stretching", "dreaming", "quizzical", "front",
		]));
		expect(states).not.toContain("progress");
		expect(tables.EYE_PLAYLIST.winking).toEqual([1]);
		expect(tables.EYE_PLAYLIST.front).toEqual([25, 26]);
		expect(tables.BLINK_MS.winking).toBeNull();
		expect(geometry.eyes).toHaveLength(27);
		const frontDimensions = geometry.eyes.slice(25).map((pair) => {
			const eye = pair[0];
			if (eye === undefined) throw new Error("缺少正面眼形");
			const xs = eye.map(([x]) => x);
			const ys = eye.map(([, y]) => y);
			return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
		});
		expect(frontDimensions[0]?.[0]).toBeCloseTo(22, 1);
		expect(frontDimensions[0]?.[1]).toBeCloseTo(48, 0);
		expect(frontDimensions[1]?.[0]).toBeCloseTo(24, 1);
		expect(frontDimensions[1]?.[1]).toBeCloseTo(44, 0);
		expect(Object.keys(geometry.shapes)).toEqual([
			"blob", "pebble", "bean", "egg", "squircle", "tablet", "capsule", "cylinder", "hex",
			"gem", "crystal", "wedge", "shield", "dome", "arch", "cloud", "teardrop", "leaf",
		]);
		expect(Object.keys(geometry.palette)).toEqual([
			"black", "brown", "red", "orange", "yellow", "green", "cyan", "blue", "violet", "magenta", "gray",
		]);
		const ringSignature = Object.keys(geometry.shapes).map((name) => [
			name,
			geometryEngine.shapeModel(name).ring.map((point) => point.map((value) => value.toFixed(9))),
		]);
		expect(createHash("sha256").update(JSON.stringify(ringSignature)).digest("hex")).toBe(
			"bbe70f8567463f0b904727f9b4a8631438598a1e345525b3d8a3875efae788ed",
		);
	});

	it("将场景拆为固定且互不重叠的控制通道", () => {
		const windowStub: Record<string, unknown> = {};
		windowStub.window = windowStub;
		vm.runInNewContext(presetsSource, windowStub);
		vm.runInNewContext(sequencesSource, windowStub);
		const presets = windowStub.GROK_PRESETS as {
			CHANNELS: string[];
			fromState(state: string): VisualPreset;
			replaceChannels(
				base: VisualPreset,
				replacement: VisualPreset,
				channels: string[],
			): VisualPreset;
			resolve(preset: VisualPreset): { choreography: string | null };
			scenes: Record<string, VisualPreset>;
		};
		const sequences = (windowStub.GROK_SEQUENCES as {
			create(presets: unknown): { cues: Record<string, Array<{ preserveEffect?: boolean }>> };
		}).create(presets);
		const expectedChannels = [
			"motion", "face", "expression", "gaze", "form",
			"decoration", "particles", "camera", "badge",
		];
		expect(presets.CHANNELS).toEqual(expectedChannels);
		for (const preset of Object.values(presets.scenes)) {
			expect(Object.keys(preset.channels)).toEqual(expectedChannels);
		}
		const coding = presets.scenes.coding;
		const playful = presets.scenes.playful;
		if (coding === undefined || playful === undefined)
			throw new Error("缺少编排测试场景");
		expect(coding.channels).toMatchObject({
			motion: { id: "working" },
			expression: { id: "working" },
			form: { id: "pencil" },
			decoration: { id: "pencil" },
			particles: { id: null },
			camera: { id: "pencil" },
		});
		expect(presets.scenes.front?.channels).toMatchObject({
			motion: { id: "listening" },
			expression: { id: "front" },
			gaze: { id: "front" },
		});
		expect(presets.scenes.happy?.choreography).toBe("happy");
		expect(playful.choreography).toBe("playful");
		expect(presets.scenes.proud?.choreography).toBe("proud");
		expect(presets.scenes.jumping?.choreography).toBeUndefined();
		expect(presets.scenes.quickHappy?.choreography).toBeUndefined();
		expect(presets.resolve(presets.fromState("playful")).choreography).toBe("playful");
		expect(presets.replaceChannels(
			coding,
			playful,
			["motion", "face", "expression", "gaze"],
		).choreography).toBe("playful");
		expect(presets.scenes.humming?.channels).toMatchObject({
			form: { id: null },
			decoration: { id: "hum-dots" },
			particles: { id: "wide-spin-belts" },
			camera: { id: null },
		});
		expect(sequences.cues.error_repeated?.[0]?.preserveEffect).toBe(true);
	});


	it("happy 进入后只触发一次弹跳", () => {
		const choreography = createChoreography(0.5);
		const context = freshChoreographyContext();

		expect(choreography.sample("happy", 0.119, context)).toEqual([]);
		expect(choreography.sample("happy", 0.12, context)).toEqual([
			expect.objectContaining({ channel: "action", type: "hop" }),
		]);
		expect(choreography.sample("happy", 1, context)).toEqual([]);
	});

	it.each([
		{ random: 0.49, type: "spin" },
		{ random: 0.5, type: "spin-dizzy" },
	])("playful 进入后只触发一次 $type 强调动作", ({ random, type }) => {
		const choreography = createChoreography(random);
		const context = freshChoreographyContext();

		expect(choreography.sample("playful", 0.119, context)).toEqual([]);
		expect(choreography.sample("playful", 0.12, context)).toEqual([
			expect.objectContaining({ channel: "action", type }),
		]);
		expect(choreography.sample("playful", 1, context)).toEqual([]);
	});

	it("proud 进入后固定触发一次旋转弹跳", () => {
		const choreography = createChoreography(0.5);
		const context = freshChoreographyContext();

		expect(choreography.sample("proud", 0.12, context)).toEqual([
			expect.objectContaining({ channel: "action", type: "spin-bounce" }),
		]);
		expect(choreography.sample("proud", 1, context)).toEqual([]);
	});

	it("角色姿态为 front 和减少动态提供独立视觉语义", () => {
		const windowStub: Record<string, unknown> = {};
		windowStub.window = windowStub;
		const deterministicMath = Object.create(Math) as Math;
		deterministicMath.random = () => 0.5;
		vm.runInNewContext(mathSource, { Math: deterministicMath, window: windowStub });
		vm.runInNewContext(actionGroupsSource, { Math: deterministicMath, window: windowStub });
		vm.runInNewContext(tablesSource, { Math: deterministicMath, window: windowStub });
		vm.runInNewContext(motionSource, { Math: deterministicMath, window: windowStub });
		vm.runInNewContext(expressionSource, { Math: deterministicMath, window: windowStub });
		vm.runInNewContext(gazeSource, { Math: deterministicMath, window: windowStub });
		type MotionController = {
			sample(
				state: string,
				globalSec: number,
				localSec: number,
				now: number,
				context: Record<string, unknown>,
				options: Record<string, unknown>,
			): { rollDeg: number; xPx: number };
		};
		type ExpressionController = {
			sample(
				state: string,
				globalSec: number,
				localSec: number,
				now: number,
				context: Record<string, unknown>,
				options: Record<string, unknown>,
			): { faceRollDeg: number };
		};
		const mathModule = windowStub.GROK_MATH as { create(random: () => number): unknown };
		const tables = (windowStub.GROK_TABLES as {
			create(data: unknown, actionGroups: unknown): unknown;
		}).create(windowStub.GROK_GEO, windowStub.O_PET_ACTION_GROUPS);
		const math = mathModule.create(deterministicMath.random);
		const motion = (windowStub.GROK_MOTION as { create(math: unknown): MotionController }).create(math);
		const expression = (windowStub.GROK_EXPRESSION as {
			create(math: unknown, tables: unknown): ExpressionController;
		}).create(math, tables);
		const gaze = (windowStub.GROK_GAZE as {
			create(math: unknown): { next(state: string): { x: number; y: number } };
		}).create(math);
		const context = { quizzicalBlinked: false };
		const moving = motion.sample("quizzical", 1, 0.9, 900, context, { direction: 1 });
		const movingFace = expression.sample("quizzical", 1, 0.9, 900, context, { direction: 1 });
		expect(moving.rollDeg).not.toBe(0);
		expect(movingFace.faceRollDeg).not.toBe(0);
		const reduced = motion.sample("quizzical", 1, 0.9, 900, context, {
			direction: 1,
			reduceMotion: true,
		});
		const reducedFace = expression.sample("quizzical", 1, 0.9, 900, context, {
			direction: 1,
			reduceMotion: true,
		});
		expect(reduced.rollDeg).toBe(0);
		expect(reduced.xPx).toBe(0);
		expect(reducedFace.faceRollDeg).not.toBe(0);
		expect(gaze.next("front")).toMatchObject({ x: 0, y: 0 });
	});

});
