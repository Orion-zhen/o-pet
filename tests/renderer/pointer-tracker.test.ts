import { describe, expect, it } from "vitest";

import { create as createMath } from "../../renderer/engine/math.js";
import { create } from "../../renderer/engine/pointer-tracker.js";

describe("帧引擎指针跟踪", () => {
	it("缓存视图边界、平滑指针偏移并服从正面视线锁定", () => {
		let boundsCount = 0;
		const tracker = create({
			bounds: () => {
				boundsCount += 1;
				return { height: 190, left: 0, top: 0, width: 190, x: 0, y: 0 };
			},
			math: createMath(() => 0.5),
		});
		tracker.setRaw({ x: 190, y: 95 });
		tracker.update(0, "idle");
		expect(tracker.position().x).toBeGreaterThan(0);
		expect(boundsCount).toBe(1);

		tracker.update(100, "idle");
		expect(boundsCount).toBe(1);
		tracker.update(201, "idle");
		expect(boundsCount).toBe(2);

		const beforeLock = tracker.position().x;
		tracker.update(202, "front");
		expect(tracker.position().tx).toBe(0);
		expect(tracker.position().x).toBeLessThan(beforeLock);
	});
});
