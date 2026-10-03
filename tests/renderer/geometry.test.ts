import { describe, expect, it } from "vitest";

import { create as createMath } from "../../renderer/engine/math.js";
import { create as createGeometry } from "../../renderer/view/geometry.js";
import data from "../../renderer/view/geometry-data.js";

describe("固定形态几何", () => {
	it("复用铅笔与圆形轮廓和路径，混合时不修改缓存", () => {
		const geometry = createGeometry({ data, math: createMath(() => 0.5) });
		const pencil = geometry.formModel("pencil");
		const circle = geometry.formModel("dots");
		const before = JSON.stringify([pencil, circle]);

		expect(pencil.ring).toHaveLength(96);
		expect(pencil.path).toBe(geometry.closedSpline(pencil.ring));
		expect(circle.path).toBe(geometry.circlePathOf(data.Re));
		for (let frame = 0; frame < 120; frame++) {
			expect(geometry.formModel("pencil")).toBe(pencil);
			expect(geometry.formModel("whirl")).toBe(circle);
			geometry.lerpRing(circle.ring, pencil.ring, frame / 120);
		}
		expect(JSON.stringify([pencil, circle])).toBe(before);
	});
});
