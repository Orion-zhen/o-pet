import { createHash } from "node:crypto";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

import {
	actionGroupsSource, expressionSource, gazeSource, geometryEngineSource, geometrySource,
	mathSource, motionSource, presetsSource, sequencesSource, tablesSource,
} from "./sources.js";

interface VisualPreset {
	channels: Record<string, { id: string | null }>;
}

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
			eyes: unknown[];
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
		expect(tables.BLINK_MS.winking).toBeNull();
		expect(geometry.eyes).toHaveLength(25);
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
		expect(presets.scenes.coding?.channels).toMatchObject({
			motion: { id: "working" },
			expression: { id: "working" },
			form: { id: "pencil" },
			decoration: { id: "pencil" },
			particles: { id: null },
			camera: { id: "pencil" },
		});
		expect(presets.scenes.humming?.channels).toMatchObject({
			form: { id: null },
			decoration: { id: "hum-dots" },
			particles: { id: "wide-spin-belts" },
			camera: { id: null },
		});
		expect(sequences.cues.error_repeated?.[0]?.preserveEffect).toBe(true);
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
