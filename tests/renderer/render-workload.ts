import { createVisualHarness } from "./visual-fixture.js";

function seededRandom(): () => number {
	let state = 0x5eed;
	return () => {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		return state / 0x1_0000_0000;
	};
}

export function createRenderWorkload(state: string) {
	const harness = createVisualHarness(seededRandom());
	harness.character.setInk({
		kind: "radial",
		center: [0.28, 0.2],
		accent: "#96938c",
		blur: 4,
		stops: [
			{ offset: 0, color: "#aaa89f", opacity: 1 },
			{ offset: 0.5, color: "#827e75", opacity: 1 },
			{ offset: 1, color: "#60594e", opacity: 1 },
		],
	});
	harness.character.playPreset(harness.presets.fromState(state));
	return harness;
}
