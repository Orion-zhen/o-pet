import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import * as presetsModule from "../../renderer/catalog/presets.js";
import { create as createSequences } from "../../renderer/catalog/sequences.js";
import { create as createTables } from "../../renderer/catalog/tables.js";
import { validate } from "../../renderer/catalog/validation.js";
import { create as createChoreographyController } from "../../renderer/engine/channels/choreography.js";
import { create as createExpression } from "../../renderer/engine/channels/expression.js";
import { create as createGaze } from "../../renderer/engine/channels/gaze.js";
import { create as createMotion } from "../../renderer/engine/channels/motion.js";
import { create as createMath } from "../../renderer/engine/math.js";
import geometryData from "../../renderer/view/geometry-data.js";
import { create as createGeometry } from "../../renderer/view/geometry.js";

interface ChoreographyController {
	sample(
		scene: string,
		localSec: number,
		context: Record<string, unknown>,
	): Array<{ channel: string; type: string }>;
}

function createChoreography(random: number): ChoreographyController {
	const math = createMath(() => random);
	return createChoreographyController(math);
}

const freshChoreographyContext = (): Record<string, unknown> => ({
	happyBounced: false,
	playfulSpun: false,
	proudFlourished: false,
	wakingBurst: false,
});

describe("渲染器目录与控制通道", () => {
	it("内嵌全部眼睛和身形数据", () => {
		const geometry = geometryData;
		const math = createMath(() => 0.5);
		const geometryEngine = createGeometry({ data: geometry, math });
		const tables = createTables();
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
		const sampleRing: Array<[number, number]> = [Math.PI / 6, -Math.PI / 6]
			.map((angle) => [
				geometry.Re + Math.cos(angle) * 100,
				geometry.Re + Math.sin(angle) * 100,
			]);
		const deformedRing = geometryEngine.deformRing(sampleRing, geometry.Re, {
			waveAmount: 1,
			wavePhase: 0,
			bumps: [],
		});
		const radii = deformedRing.map(([x, y]: [number, number]) =>
			Math.hypot(x - geometry.Re, y - geometry.Re)
		);
		expect(radii[0]).toBeGreaterThan(102);
		expect(radii[1]).toBeLessThan(98);

		const bumpRing: Array<[number, number]> = [-0.3, 0, 0.3].map((angle) => [
			geometry.Re + Math.cos(angle) * 100,
			geometry.Re + Math.sin(angle) * 100,
		]);
		const bumpedRing = geometryEngine.deformRing(bumpRing, geometry.Re, {
			waveAmount: 0,
			wavePhase: 0,
			bumps: [{ angle: 0, amount: 9, width: 0.25 }],
		});
		const bumpedRadii = bumpedRing.map(([x, y]: [number, number]) =>
			Math.hypot(x - geometry.Re, y - geometry.Re)
		);
		expect(bumpedRadii).toEqual([100, 109, 100]);
		const ringSignature = Object.keys(geometry.shapes).map((name) => [
			name,
			geometryEngine.shapeModel(name).ring.map((point: [number, number]) =>
				point.map((value: number) => value.toFixed(9))
			),
		]);
		expect(createHash("sha256").update(JSON.stringify(ringSignature)).digest("hex")).toBe(
			"bbe70f8567463f0b904727f9b4a8631438598a1e345525b3d8a3875efae788ed",
		);
	});

	it("将场景拆为固定且互不重叠的控制通道", () => {
		const presets = presetsModule;
		const sequences = createSequences(presets);
		const expectedChannels = [
			"motion", "face", "expression", "gaze", "shape", "form",
			"decoration", "particles", "camera", "badge",
		];
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
			shape: { id: null },
		});
		expect(presets.scenes["thinking-alt"]?.channels).toMatchObject({
			motion: { id: "thinking-alt" },
			expression: { id: "thinking" },
			gaze: { id: "thinking" },
			shape: { id: "cloud" },
			form: { id: null },
			decoration: { id: "thought-pulse" },
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
		for (const cue of [
			"completed_quick", "completed_normal", "completed_hard", "run_failed",
		] as const) {
			expect(sequences.cues[cue]?.at(-1)?.duration).toBe(5000);
		}
	});


	it("全部可预览动作都能解析为完整控制通道", () => {
		const source: unknown = JSON.parse(readFileSync(
			new URL("../../renderer/catalog/action-groups.json", import.meta.url),
			"utf8",
		));
		if (!Array.isArray(source)) throw new Error("动作目录必须是数组");
		const actionNames = source.flatMap((group: unknown): string[] => {
			if (typeof group !== "object" || group === null)
				throw new Error("动作分组必须是对象");
			const states: unknown = Reflect.get(group, "states");
			if (!Array.isArray(states) || !states.every((state) => typeof state === "string"))
				throw new Error("动作分组 states 必须是字符串数组");
			return states;
		});

		const tables = createTables();
		expect(() => validate(actionNames, presetsModule, tables)).not.toThrow();
		expect(() => validate([...actionNames, "missing-action"], presetsModule, tables)).toThrow();
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
		const deterministicRandom = (): number => 0.5;
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
		const tables = createTables();
		const math = createMath(deterministicRandom);
		const motion = createMotion(math, tables) as MotionController;
		const expression = createExpression(math, tables) as ExpressionController;
		const gaze = createGaze(math);
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
