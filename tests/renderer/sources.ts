import { readFileSync } from "node:fs";

function readModule(path: string): string {
	const source = readFileSync(new URL(path, import.meta.url), "utf8");
	return `globalThis[Symbol.for("o-pet.renderer")] = window;\n${source}`;
}

export const startSource = readModule("../../renderer/start.js");
export const hostSource = readModule("../../renderer/host.js");
export const particlesSource = readModule("../../renderer/view/particles.js");
export const schedulerSource = readModule("../../renderer/runtime/scheduler.js");
export const timelineSource = readModule("../../renderer/runtime/timeline.js");
export const presenterSource = readModule("../../renderer/runtime/presenter.js");
export const activitiesSource = readModule("../../renderer/behaviors/activities.js");
export const idleSource = readModule("../../renderer/behaviors/idle.js");
export const cuesSource = readModule("../../renderer/behaviors/cues.js");
export const interactionSource = readModule("../../renderer/behaviors/interaction.js");
export const pointerSource = readModule("../../renderer/adapters/pointer.js");
export const preferencesSource = readModule("../../renderer/adapters/preferences.js");
export const actionsSource = readModule("../../renderer/engine/actions.js");
export const visualChannelsSource = readModule("../../renderer/engine/visual-channels.js");
export const runtimeSource = readModule("../../renderer/engine/runtime.js");
export const choreographySource = readModule("../../renderer/engine/channels/choreography.js");
export const effectsSource = readModule("../../renderer/view/effects.js");
export const eyesSource = readModule("../../renderer/view/eyes.js");
export const renderSource = readModule("../../renderer/view/svg.js");
export const geometrySource = readModule("../../renderer/view/geometry-data.js");
export const geometryEngineSource = readModule("../../renderer/view/geometry.js");
export const mathSource = readModule("../../renderer/engine/math.js");
export const motionSource = readModule("../../renderer/engine/channels/motion.js");
export const expressionSource = readModule("../../renderer/engine/channels/expression.js");
export const gazeSource = readModule("../../renderer/engine/channels/gaze.js");
export const presetsSource = readModule("../../renderer/catalog/presets.js");
export const sequencesSource = readModule("../../renderer/catalog/sequences.js");
export const tablesSource = readModule("../../renderer/catalog/tables.js");
