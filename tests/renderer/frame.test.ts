import { describe, expect, it } from "vitest";
import { create } from "../../renderer/engine/frame.js";
import { createVisualHarness } from "./visual-fixture.js";

function sourceFrame() {
	const harness = createVisualHarness();
	const source = harness.latestFrame();
	harness.character.destroy();
	return {
		...source,
		blink: { x: 0.5, t: 1, v: 0.1 },
		pose: { ...source.pose },
		poseHome: { ...source.poseHome },
		faceTune: { ...source.faceTune },
	};
}

describe("不可变帧快照复用", () => {
	it("逐帧创建独立快照, 但复用值完全相同的弹簧和姿态数据", () => {
		const project = create();
		const source = sourceFrame();
		const first = project(source);
		const second = project({ ...source, now: source.now + 16 });

		expect(second).not.toBe(first);
		for (const key of ["blink", "shapeSpring", "pose", "poseHome", "faceTune"] as const) {
			expect(second[key]).toBe(first[key]);
			expect(Object.isFrozen(second[key])).toBe(true);
		}
		expect(first.now).toBe(source.now);
	});

	it.each(["x", "t", "v"] as const)("弹簧 %s 改变时生成新快照, 不修改旧帧", (key) => {
		const project = create();
		const source = sourceFrame();
		const first = project(source);
		const old = first.blink[key];
		source.blink[key] += 0.01;
		const second = project(source);
		expect(second.blink).not.toBe(first.blink);
		expect(second.blink[key]).toBe(source.blink[key]);
		expect(first.blink[key]).toBe(old);
	});

	it("形状缩放、参考姿态和眼睛参数更新后不复用过期数据", () => {
		const project = create();
		const source = sourceFrame();
		const first = project(source);
		const original = JSON.stringify(first);
		source.pose.scale += 0.1;
		source.poseHome.turn += 1;
		source.faceTune.eyeWidth += 0.1;
		const second = project(source);
		for (const key of ["pose", "poseHome", "faceTune"] as const) {
			expect(second[key]).not.toBe(first[key]);
			expect(second[key]).toEqual(source[key]);
		}
		expect(JSON.stringify(first)).toBe(original);
	});
});
