import { bench, describe } from "vitest";
import { createRenderWorkload } from "./render-workload.js";

// 每次完整回放相同的 60 秒, 不包含截图或哈希计算.
// DOM 使用测试替身, 结果只代表 JS 工作负载, 不代表 WebView 绘制或整机功耗.
describe("60 秒动画 / 60 Hz / 固定随机种子", () => {
	for (const state of ["idle", "sleeping", "thinking-alt", "writing", "humming"]) {
		bench(state, () => {
			const harness = createRenderWorkload(state);
			try {
				for (let frame = 1; frame <= 3600; frame++)
					harness.frame(frame * 1000 / 60);
			} finally {
				harness.character.destroy();
			}
		}, { iterations: 10, time: 0, warmupIterations: 3, warmupTime: 0 });
	}
});
