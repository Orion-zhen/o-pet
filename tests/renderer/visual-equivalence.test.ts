import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { actions } from "../../renderer/catalog/presets.js";
import geometryData from "../../renderer/view/geometry-data.js";
import { createRenderWorkload } from "./render-workload.js";
import { svgHash } from "./visual-fixture.js";

function trace(harness: ReturnType<typeof createRenderWorkload>) {
	const svg = createHash("sha256");
	const frames = createHash("sha256");
	return {
		frame(time: number) {
			harness.frame(time);
			svg.update(svgHash(harness.svg));
			frames.update(JSON.stringify(harness.latestFrame()));
		},
		result: () => ({ svg: svg.digest("hex"), frames: frames.digest("hex") }),
	};
}

// 基线在优化前生成. 每个摘要包含整段回放的每一帧, 不是单张关键帧.
describe("逐帧输出等价", () => {
	const shapes = Object.keys(geometryData.shapes);
	it.each(Object.keys(actions).map((action, index) => ({
		action,
		shape: shapes[index % shapes.length]!,
	})))("$action / $shape 的入场、持续动作和退场", ({ action, shape }) => {
		const harness = createRenderWorkload(action);
		const recording = trace(harness);
		try {
			harness.character.setShape(shape);
			for (let frame = 1; frame <= 360; frame++) {
				if (frame === 241)
					harness.character.setPreset(harness.presets.fromState("idle"));
				recording.frame(frame * 1000 / 60);
			}
			expect(recording.result()).toMatchSnapshot();
		} finally {
			harness.character.destroy();
		}
	});

	it.each([
		{ name: "60 Hz", intervals: [1000 / 60] },
		{ name: "120 Hz", intervals: [1000 / 120] },
		{ name: "不规则帧间隔", intervals: [8, 17, 33, 11, 50, 16] },
	])("$name 下的视线、形变、特效切换与长时间空闲", ({ intervals }) => {
		const harness = createRenderWorkload("idle");
		const recording = trace(harness);
		const events: Array<[number, () => void]> = [
			[1200, () => harness.character.setPointerPosition({ x: 25, y: 140 })],
			[2200, () => harness.character.setGazeTarget({ x: 160, y: 40 })],
			[3000, () => harness.character.setShape("cloud")],
			[3500, () => harness.character.setShape("crystal")],
			[4200, () => harness.character.winkOnce(1)],
			[5000, () => harness.character.spinOnce(2, -1)],
			[6300, () => harness.character.pounceOnce(1, 0.7)],
			[7500, () => harness.character.playPreset(harness.presets.fromState("thinking-alt"))],
			[9000, () => harness.character.playPreset(harness.presets.fromState("writing"))],
			[9200, () => harness.character.playPreset(harness.presets.fromState("loading"))],
			[11_000, () => {
				harness.character.setPointerPosition(null);
				harness.character.setGazeTarget(null);
				harness.character.setPreset(harness.presets.fromState("idle"));
			}],
			[30_000, () => harness.character.setPreset(harness.presets.fromState("sleeping"))],
		];
		let eventIndex = 0;
		let time = 0;
		let frameIndex = 0;
		try {
			while (time < 60_000) {
				time += intervals[frameIndex++ % intervals.length]!;
				harness.setTime(time);
				while (eventIndex < events.length && events[eventIndex]![0] <= time)
					events[eventIndex++]![1]();
				recording.frame(time);
			}
			expect(recording.result()).toMatchSnapshot();
		} finally {
			harness.character.destroy();
		}
	});
});
